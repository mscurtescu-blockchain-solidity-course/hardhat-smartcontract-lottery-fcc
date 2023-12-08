const {network, ethers} = require("hardhat");
const {
    networkConfig,
    developmentChains,
    VERIFICATION_BLOCK_CONFIRMATIONS,
} = require("../helper-hardhat-config")

module.exports = async function({ getNamedAccounts, deployments }) {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()
    const chainId = network.config.chainId

    let vrfCoordinatorV2Address, subscriptionId
    if (developmentChains.includes(network.name)) {
        // const vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock")
        const vrfCoordinatorV2Mock = await deployments.get("VRFCoordinatorV2Mock")
        vrfCoordinatorV2Address = vrfCoordinatorV2Mock.address

        // create and fund the subscription
        const transactionResponse = await vrfCoordinatorV2Mock.createSubscription()
        const transactionReceipt = await transactionResponse.wait(1)
        subscriptionId = transactionReceipt.events[0].args.subId
        await vrfCoordinatorV2Mock.fundSubscription(subscriptionId, ethers.parseEther("1"))
    } else {
        vrfCoordinatorV2Address = networkConfig[chainId]["vrfCoordinatorV2"]

        // we could create and found automatically on a test net as well
        // for simplicity for test nets we have to use the UI to create and fund a subscription, and save the id
        subscriptionId = networkConfig[chainId]["subscriptionId"];
    }

    const raffle = await deploy("Raffle", {
        from: deployer,
        args: [
            vrfCoordinatorV2Address,
            networkConfig[chainId]["gasLane"],
            subscriptionId,
            networkConfig[chainId]["callbackGasLimit"],
            networkConfig[chainId]["keepersUpdateInterval"],
            networkConfig[chainId]["raffleEntranceFee"]
        ],
        log: true,
        waitConfirmations: network.config.blockConfirmations || 1,
    })
}
