import { Connectors } from 'web3-react'
import { Authereum } from 'authereum'
import Web3 from 'web3'
const { Connector, ErrorCodeMixin } = Connectors

const network = process.env.REACT_APP_NETWORK
let enabled = false

const checkWeb3 = async () => {
  if (window.ethereum && window.ethereum.isAuthereum) {
    // NOTE: set timeout to override MetaMask
    setTimeout(() => {
      clearInterval(interval)
    }, 1e2)
  } else {
    // NOTE: temp fix to prevent redirect on mobile upon first load
    setTimeout(() => {
      enabled = true
    }, 2e3)

    const authereum = new Authereum(network)
    const provider = authereum.getProvider()
    window.ethereum = provider
    window.web3 = new Web3(provider)

    if (window.ethereum && window.ethereum.authereum && await window.ethereum.authereum.isAuthenticated()) {
      window.ethereum.enable()
    }
  }
}

let interval = setInterval(() => checkWeb3(), 1e3)
checkWeb3()

const InjectedConnectorErrorCodes = ['ETHEREUM_ACCESS_DENIED', 'NO_WEB3', 'UNLOCK_REQUIRED']
export default class InjectedConnector extends ErrorCodeMixin(Connector, InjectedConnectorErrorCodes) {
  constructor(args = {}) {
    super(args)
    this.runOnDeactivation = []

    this.networkChangedHandler = this.networkChangedHandler.bind(this)
    this.accountsChangedHandler = this.accountsChangedHandler.bind(this)

    const { ethereum } = window
    console.log("ETHEREUM = ", ethereum)
    if (ethereum && ethereum.isMetaMask) {
      ethereum.autoRefreshOnNetworkChange = false
    }
  }

  async onActivation() {
    const { ethereum, web3 } = window

    if (ethereum && enabled) {
      await ethereum.enable().catch(error => {
        const deniedAccessError = Error(error)
        deniedAccessError.code = InjectedConnector.errorCodes.ETHEREUM_ACCESS_DENIED
        throw deniedAccessError
      })

      // initialize event listeners
      if (ethereum.on) {
        ethereum.on('networkChanged', this.networkChangedHandler)
        ethereum.on('accountsChanged', this.accountsChangedHandler)

        this.runOnDeactivation.push(() => {
          if (ethereum.removeListener) {
            ethereum.removeListener('networkChanged', this.networkChangedHandler)
            ethereum.removeListener('accountsChanged', this.accountsChangedHandler)
          }
        })
      }
    } else if (web3) {
      console.warn('Your web3 provider is outdated, please upgrade to a modern provider.')
    } else {
      const noWeb3Error = Error('Your browser is not equipped with web3 capabilities.')
      noWeb3Error.code = InjectedConnector.errorCodes.NO_WEB3
      throw noWeb3Error
    }
  }

  async getProvider() {
    const { ethereum, web3 } = window
    return ethereum || web3.currentProvider
  }

  async getAccount(provider) {
    const account = await super.getAccount(provider)

    if (account === null) {
      const unlockRequiredError = Error('Ethereum account locked.')
      unlockRequiredError.code = InjectedConnector.errorCodes.UNLOCK_REQUIRED
      throw unlockRequiredError
    }

    return account
  }

  onDeactivation() {
    this.runOnDeactivation.forEach(runner => runner())
    this.runOnDeactivation = []
  }

  // event handlers
  networkChangedHandler(networkId) {
    const networkIdNumber = Number(networkId)

    try {
      super._validateNetworkId(networkIdNumber)

      super._web3ReactUpdateHandler({
        updateNetworkId: true,
        networkId: networkIdNumber
      })
    } catch (error) {
      super._web3ReactErrorHandler(error)
    }
  }

  accountsChangedHandler(accounts) {
    if (!accounts[0]) {
      const unlockRequiredError = Error('Ethereum account locked.')
      unlockRequiredError.code = InjectedConnector.errorCodes.UNLOCK_REQUIRED
      super._web3ReactErrorHandler(unlockRequiredError)
    } else {
      super._web3ReactUpdateHandler({
        updateAccount: true,
        account: accounts[0]
      })
    }
  }
}
