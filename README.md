# Lesson 9: Hardhat Smart Contract Lottery


Lesson 9 from the Web3, Full Stack Solidity, Smart Contract & Blockchain - Beginner to Expert ULTIMATE
Course | Javascript Edition:
https://github.com/smartcontractkit/full-blockchain-solidity-course-js#lesson-9-hardhat-smart-contract-lottery

Official code at:
https://github.com/PatrickAlphaC/hardhat-smartcontract-lottery-fcc

## Notes

* using the `Automation*` interfaces provided by Chainlink as opposed to `Keepers*` (which seems legacy)
  * https://docs.chain.link/chainlink-automation
* in order to register a new `Upkeep` for the sample Remix app using a Custom trigger
* replaced
    ```javascript
    vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer)
    ```
  (and similar) with
    ```javascript
    const vrfCoordinatorV2MockDeployment = await deployments.get("VRFCoordinatorV2Mock")
    vrfCoordinatorV2Mock = await ethers.getContractAt(
        vrfCoordinatorV2MockDeployment.abi,
        vrfCoordinatorV2MockDeployment.address
    )
    ```
* replaced `transactionReceipt.events` with `transactionReceipt.logs`
* replaced
    ```javascript
    await expect(raffle.enterRaffle()).to.be.revertedWith("Raffle__NotEnoughETHEntered")
    ```
  (and similar) with
    ```javascript
    await expect(raffle.enterRaffle()).to.be.revertedWithCustomError(raffle, "Raffle__NotEnoughETHEntered")
    ```
* replaced `interval.toNumber()` with `Number(interval)`
* replace `vrfCoordinatorV2Mock.address` with `vrfCoordinatorV2Mock.getAddress()`
  * but not for the freshly deployed `raffle`
* using "@chainlink/contracts" version 0.8 instead of 0.4
  * the raffle contract must be added to the mock coordinator, otherwise requests will be rejected with *reverted with custom error 'InvalidConsumer()'*:
    ```javascript
    if (developmentChains.includes(network.name)) {
        // add the raffle as a consumer
        await vrfCoordinatorV2Mock.addConsumer(subscriptionId, raffle.address)
    }
    ```
  * for `performUpkeep` use `"0x"` as argument instead of `[]` (this could be an ethers v6 thing)
* for static calls replace `raffle.callStatic.checkUpkeep([])` with `raffle.checkUpkeep.staticCall("0x")` (and similar) 
* 