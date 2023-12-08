const {network, ethers} = require("hardhat");
const {
    networkConfig,
    developmentChains,
} = require("../helper-hardhat-config")
const { verify } = require("../utils/verify")

module.exports = async function({ getNamedAccounts, deployments }) {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()
    const chainId = network.config.chainId

    let vrfCoordinatorV2Address, subscriptionId, vrfCoordinatorV2Mock
    if (developmentChains.includes(network.name)) {
        const vrfCoordinatorV2MockDeployment = await deployments.get("VRFCoordinatorV2Mock")
        vrfCoordinatorV2Mock = await ethers.getContractAt(
            vrfCoordinatorV2MockDeployment.abi,
            vrfCoordinatorV2MockDeployment.address
        )
        vrfCoordinatorV2Address = await vrfCoordinatorV2Mock.getAddress()

        // create and fund the subscription
        const transactionResponse = await vrfCoordinatorV2Mock.createSubscription()
        const transactionReceipt = await transactionResponse.wait(1)
        subscriptionId = transactionReceipt.logs[0].args.subId
        await vrfCoordinatorV2Mock.fundSubscription(subscriptionId, ethers.parseEther("1"))
    } else {
        vrfCoordinatorV2Address = networkConfig[chainId]["vrfCoordinatorV2"]

        // we could create and found automatically on a test net as well
        // for simplicity for test nets we have to use the UI to create and fund a subscription, and save the id
        subscriptionId = networkConfig[chainId]["subscriptionId"];
    }

    let arguments = [
        vrfCoordinatorV2Address,
        networkConfig[chainId]["gasLane"],
        subscriptionId,
        networkConfig[chainId]["callbackGasLimit"],
        networkConfig[chainId]["keepersUpdateInterval"],
        networkConfig[chainId]["raffleEntranceFee"]
    ];

    const raffle = await deploy("Raffle", {
        from: deployer,
        args: arguments,
        log: true,
        waitConfirmations: network.config.blockConfirmations || 1,
    })

    if (developmentChains.includes(network.name)) {
        // add the raffle as a consumer
        await vrfCoordinatorV2Mock.addConsumer(subscriptionId, raffle.address)
    }

    if (!developmentChains.includes(network.name) && process.env.ETHERSCAN_API_KEY) {
        log("Verifying...")
        await verify(raffle.address, arguments)
    }

    log("Raffle deployed!")
    log("------------------------------------------")
}

module.exports.tags = ["all", "raffle"]
