import { Component, OnInit, ViewChild } from '@angular/core'
import { MetaverseService } from '../../../services/metaverse.service'
import { Platform } from '@ionic/angular'
import { AlertService } from '../../../services/alert.service'
import { WalletService } from '../../../services/wallet.service'
import { TranslateService } from '@ngx-translate/core'
import { Router } from '@angular/router'

@Component({
  selector: 'app-add',
  templateUrl: './add.page.html',
  styleUrls: ['./add.page.scss'],
})
export class AddPage {

  creation_type: string = "new"
  addressbalances: Array<any>
  addresses: Array<string>
  passphrase: string = ""
  address: string = ""
  myPublicKey: string = ""
  cosignersLimit: number = 20

  cosigners: Array<string> = []
  nbrSigReq: number
  nbrSigReqOptions: Array<number> = [1, 2]
  import_address: string = ""
  @ViewChild('importAddressInput') importAddressInput
  passphrase_import: string = ""
  validPublicKeys: boolean = false
  isApp: boolean

  customTrackBy(index: number, obj: any): any {
    return index
  }

  constructor(
    private mvs: MetaverseService,
    public platform: Platform,
    private alert: AlertService,
    private wallet: WalletService,
    // private keyboard: Keyboard,
    private translate: TranslateService,
    private router: Router,
  ) {

    this.cosigners.push('')

    this.isApp = (!document.URL.startsWith('http') || document.URL.startsWith('http://localhost:8080'))

    //Load addresses and balances
    Promise.all([this.mvs.getAddresses(), this.mvs.getAddressBalances()])
      .then((balances) => {
        let addresses = balances[0]
        let addressbalances = balances[1]
        let addrblncs = []
        Object.keys(addresses).forEach((index) => {
          let address = addresses[index]
          if (addressbalances[address]) {
            addrblncs.push({ "address": address, "avatar": addressbalances[address].AVATAR ? addressbalances[address].AVATAR : "", "identifier": addressbalances[address].AVATAR ? addressbalances[address].AVATAR : address, "balance": addressbalances[address].ETP.available })
          } else {
            addrblncs.push({ "address": address, "avatar": "", "identifier": address, "balance": 0 })
          }
        })
        this.addressbalances = addrblncs
      })

  }

  cancel() {
    this.router.navigate(['account', 'multisig'])
  }

  onAddressChange(event) {
    this.myPublicKey = ""
  }

  getPublicKey(address) {
    this.alert.showLoading()
      .then(() => this.wallet.getWallet(this.passphrase))
      .then(wallet => this.wallet.getPublicKeyByAddress(wallet, address))
      .then(publicKey => {
        this.alert.stopLoading()
        this.myPublicKey = publicKey
      })
      .catch(error => {
        console.error(error)
        this.alert.stopLoading()
        switch (error.message) {
          case "ERR_DECRYPT_WALLET":
            this.alert.showError('MESSAGE.PASSWORD_WRONG', '')
            break
          default:
            this.alert.showError('MULTISIG.MESSAGE.ERROR_GET_PUBLIC_KEY', error.message)
            break
        }
      })
  }

  getAddress(cosigners, nbrSigReq, myPublicKey, passphrase) {
    if (!this.myPublicKey) {
      this.alert.showError('MULTISIG.MESSAGE.ERROR_MISSING_MY_PUBLIC_KEY', '')
    } else if (!this.validPublicKeys) {
      this.alert.showError('MULTISIG.MESSAGE.ERROR_MULTISIG_WRONG_PUBLIC_KEYS', '')
    } else {
      try {
        this.alert.showLoading()
          .then(() => {
            let nbrSigns = parseInt(nbrSigReq)
            let publicKeys = cosigners.concat(myPublicKey)
            let multisig = this.wallet.getNewMultisigAddress(nbrSigns, publicKeys)
            let newMultisig = {
              "d": "",
              "k": publicKeys,
              "m": nbrSigns,
              "n": publicKeys.length,
              "s": myPublicKey,
              "a": multisig.address,
              "r": multisig.script
            }
            this.addMultisigAddress(newMultisig, true, passphrase)
          })
      } catch (e) {
        console.error(e)
        this.alert.stopLoading()
        this.alert.showError('MULTISIG.ADD.ERROR', e.message)
      }
    }
  }

  importAddress(address, passphrase) {
    this.alert.showLoading()
      .then(() => {
        try {
          this.mvs.getMultisigWallet(address.trim())
            .then((newMultisig) => {
              if (!newMultisig) {
                this.alert.stopLoading()
                this.alert.showError('MULTISIG.MESSAGE.ERROR_IMPORT_ADDRESS_UNKNOW', '')
              } else {
                Promise.all([this.mvs.getAddresses(), this.wallet.getWallet(passphrase)])
                  .then((result) => {
                    let addresses = result[0]
                    let wallet = result[1]
                    let myPublicKey = undefined
                    Promise.all(newMultisig.k.map((publicKey) => {
                      this.wallet.findDeriveNodeByPublic(wallet, publicKey, addresses ? addresses.length : undefined)
                        .then(myMultisigWallet => {
                          //console.log("Found it!")
                          myPublicKey = publicKey
                        })
                        .catch(error => {
                          this.alert.stopLoading()
                          switch (error.message) {
                            case "ERR_NO_HDNODE_FOR_PUBLICKEY":
                              //not user's public key
                              break
                            default:
                              console.error(error)
                              break
                          }
                        })
                    }))
                      .then(() => {
                        if (myPublicKey) {
                          newMultisig.s = myPublicKey
                          let multisig = this.wallet.getNewMultisigAddress(newMultisig.m, newMultisig.k)
                          newMultisig.r = multisig.r
                          this.addMultisigAddress(newMultisig, false, passphrase)
                        } else {
                          this.alert.stopLoading()
                          this.alert.showError('MULTISIG.MESSAGE.ERROR_ADDRESS_NOT_THIS_WALLET', '')
                        }
                      })
                  })
                  .catch(error => {
                    console.error(error)
                    this.alert.stopLoading()
                    switch (error.message) {
                      case "ERR_DECRYPT_WALLET":
                        this.alert.showError('MESSAGE.PASSWORD_WRONG', '')
                        break
                      default:
                        this.alert.showError('MULTISIG.MESSAGE.ERROR_GET_PUBLIC_KEY', error.message)
                        break
                    }
                  })
              }
            })
        } catch (e) {
          console.error(e)
          this.alert.stopLoading()
          this.alert.showError('IMPORT_ADDRESS.ERROR', e.message)
        }
      })
  }

  addMultisigAddress(newMultisig, newAddress: boolean, passphrase) {
    this.wallet.getMultisigAddresses()
      .then((multisigAddresses) => {
        if (multisigAddresses.indexOf(newMultisig.a) !== -1) {
          this.alert.stopLoading()
          this.alert.showError('MULTISIG.ADD.ADDRESS_ALREADY_EXISTS', newMultisig.a)
        } else {
          try {
            if (newAddress) {
              this.mvs.addMultisigWallet(newMultisig)
            }
          } catch (error) {
            console.error(error)
          }
          this.wallet.addMultisig(newMultisig)
            .then(() => this.wallet.saveSessionAccount(passphrase))
            .then(() => this.alert.stopLoading())
            .then(() => this.alert.showMessage(newAddress ? 'MULTISIG.MESSAGE.SUCCESS_CREATE_MULTISIG' : 'MULTISIG.MESSAGE.SUCCESS_IMPORT_MULTISIG', '', newMultisig.a))
            .then(() => this.router.navigate(['/loading'], { state: { data: { reset: true } } }))
            .catch(error => {
              console.error(error)
              this.alert.stopLoading()
              this.alert.showError('MULTISIG.ADD.ERROR', error.message)
            })
        }
      })
  }

  scan() {
    // this.translate.get(['SCANNING.MESSAGE_ADDRESS']).subscribe((translations: any) => {
    //     this.barcodeScanner.scan(
    //         {
    //             preferFrontCamera: false,
    //             showFlipCameraButton: false,
    //             showTorchButton: false,
    //             torchOn: false,
    //             prompt: translations['SCANNING.MESSAGE_ADDRESS'],
    //             resultDisplayDuration: 0,
    //             formats: "QR_CODE",
    //         }).then((result) => {
    //             if (!result.cancelled) {
    //                 let content = result.text.toString().split('&')
    //                 if (this.mvs.validAddress(content[0]) == true) {
    //                     this.import_address = content[0]
    //                     this.importAddressInput.setFocus();
    //                     this.keyboard.close()
    //                 } else {
    //                     this.alert.showWrongAddress()
    //                 }
    //             }
    //         })
    // })
  }

  addCosigner() {
    this.cosigners.push('')
    this.nbrSigReqOptions.push(this.nbrSigReqOptions.length + 1)
    this.checkPublicKeys()
  }

  removeCosigner(index) {
    this.cosigners.splice(index, 1)
    this.nbrSigReqOptions.pop()
    this.checkPublicKeys()
  }

  validPassword = (password) => (password) ? password.length > 0 : false;

  validAddress = this.mvs.validAddress

  validPublicKey = (publicKey, i) => (publicKey) ? publicKey.length == 66 && this.validNotMyKey(publicKey) && this.validUsedOnceKey(publicKey, i) : false;

  validNotMyKey = (publicKey) => publicKey !== this.myPublicKey

  validUsedOnceKey = (publicKey, i) => this.cosigners.indexOf(publicKey) === i

  validnbrSigReq = (nbrSigReq) => nbrSigReq && nbrSigReq > 0

  checkPublicKeys = () => {
    let valid = true
    this.cosigners.forEach((key, i) => {
      if (!key || !this.validPublicKey(key, i))
        valid = false
    })
    this.validPublicKeys = valid
  }

}