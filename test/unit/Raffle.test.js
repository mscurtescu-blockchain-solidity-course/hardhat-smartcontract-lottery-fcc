const { assert, expect } = require("chai")
const { network, deployments, ethers, getNamedAccounts} = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle", async function () {
        let raffle, vrfCoordinatorV2Mock, raffleEntranceFee, deployer, interval
        const chainId = network.config.chainId

        beforeEach(async function () {
            deployer  = (await getNamedAccounts()).deployer
            await deployments.fixture(["all"])

            const raffleDeployment = await deployments.get("Raffle")
            raffle = await ethers.getContractAt(
                raffleDeployment.abi,
                raffleDeployment.address
            )

            const vrfCoordinatorV2MockDeployment = await deployments.get(
                "VRFCoordinatorV2Mock"
            )
            vrfCoordinatorV2Mock = await ethers.getContractAt(
                vrfCoordinatorV2MockDeployment.abi,
                vrfCoordinatorV2MockDeployment.address
            )

            raffleEntranceFee = await raffle.getEntranceFee()
            interval = await raffle.getInterval()
        })

        describe("constructor", async function () {
            it('should construct correctly', async () => {
                const raffleState = await raffle.getRaffleState()
                assert.equal(raffleState, 0 /* RaffleState.OPEN */)
                assert.equal(interval.toString(), networkConfig[chainId]["keepersUpdateInterval"])
            })
        })

        describe("enterRaffle", async function () {
            it("should revert when you don't pay enough", async () => {
                await expect(raffle.enterRaffle()).to.be.revertedWithCustomError(raffle, "Raffle__NotEnoughETHEntered")
            })

            it('should records players when they enter', async () => {
                await raffle.enterRaffle({ value: raffleEntranceFee })
                const player = await raffle.getPlayer(0)
                assert.equal(player, deployer)
            })

            it('should emit event on enter', async () => {
                await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.emit(raffle, "RaffleEnter")
            })

            it('should not allow entrance when raffle is calculating', async () => {
                await raffle.enterRaffle({ value: raffleEntranceFee })
                await network.provider.send("evm_increaseTime", [Number(interval) + 1])
                await network.provider.send("evm_mine", [])

                // pretend to be Chainlink Automation
                await raffle.performUpkeep("0x") // changes state to CALCULATING
                await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.be.revertedWithCustomError(raffle, "Raffle__NotOpen")
            })
        })
    })