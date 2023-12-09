const { assert, expect } = require("chai")
const { network, deployments, ethers, getNamedAccounts} = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle", function () {
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

        describe("constructor", function () {
            it('should construct correctly', async () => {
                const raffleState = await raffle.getRaffleState()
                assert.equal(raffleState, 0 /* RaffleState.OPEN */)
                assert.equal(interval.toString(), networkConfig[chainId]["keepersUpdateInterval"])
            })
        })

        describe("enterRaffle", function () {
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

        describe("checkUpkeep", function () {
            it('should return false if people did not enter', async () => {
                await network.provider.send("evm_increaseTime", [Number(interval) + 1])
                await network.provider.send("evm_mine", [])

                const { upkeepNeeded } = await raffle.checkUpkeep.staticCall("0x")
                assert.isFalse(upkeepNeeded)
            })

            it('should return false if raffle is not open', async () => {
                await raffle.enterRaffle({ value: raffleEntranceFee })
                await network.provider.send("evm_increaseTime", [Number(interval) + 1])
                await network.provider.send("evm_mine", [])
                await raffle.performUpkeep("0x") // changes state to CALCULATING

                const raffleState = await raffle.getRaffleState()
                const { upkeepNeeded } = await raffle.checkUpkeep.staticCall("0x")
                assert.equal(raffleState, 1 /* RaffleState.CALCULATING */)
                assert.isFalse(upkeepNeeded)
            })

            it("returns false if enough time hasn't passed", async () => {
                await raffle.enterRaffle({ value: raffleEntranceFee })
                await network.provider.send("evm_increaseTime", [Number(interval) - 5]) // use a higher number here if this test fails
                await network.provider.send("evm_mine", [])
                const { upkeepNeeded } = await raffle.checkUpkeep.staticCall("0x") // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
                assert.isFalse(upkeepNeeded)
            })

            it("returns true if enough time has passed, has players, eth, and is open", async () => {
                await raffle.enterRaffle({ value: raffleEntranceFee })
                await network.provider.send("evm_increaseTime", [Number(interval) + 1])
                await network.provider.send("evm_mine", [])
                const { upkeepNeeded } = await raffle.checkUpkeep.staticCall("0x") // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
                assert.isTrue(upkeepNeeded)
            })
        })

        describe("performUpkeep", function () {
            it('should run only if checkUpkeep returns true', async () => {
                await raffle.enterRaffle({ value: raffleEntranceFee })
                await network.provider.send("evm_increaseTime", [Number(interval) + 1])
                await network.provider.send("evm_mine", [])

                const tx = await raffle.performUpkeep("0x")
                assert(tx)
            })

            it('should revert when checkUpkeep returns false', async () => {
                await expect(raffle.performUpkeep("0x")).to.be.revertedWithCustomError(raffle, "Raffle__UpkeepNotNeeded")
            })

            it('should update the raffle state, emit an event and call the coordinator', async () => {
                await raffle.enterRaffle({ value: raffleEntranceFee })
                await network.provider.send("evm_increaseTime", [Number(interval) + 1])
                await network.provider.send("evm_mine", [])

                const txResponse = await raffle.performUpkeep("0x")
                const txReceipt = await txResponse.wait(1)
                const requestId = txReceipt.logs[1].args.requestId
                assert.isAbove(requestId, 0)
                const raffleState = await raffle.getRaffleState()
                assert.equal(raffleState, 1 /* RaffleState.CALCULATING */)
            })
        })

        describe("fulfillRandomWords", function () {
            beforeEach(async function () {
                await raffle.enterRaffle({ value: raffleEntranceFee })
                await network.provider.send("evm_increaseTime", [Number(interval) + 1])
                await network.provider.send("evm_mine", [])
            })

            it('can only be called after performUpkeep', async () => {
                await expect(vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.getAddress())).to.be.reverted
                await expect(vrfCoordinatorV2Mock.fulfillRandomWords(1, raffle.getAddress())).to.be.reverted
            })

            it('should pick a winner, reset the lottery and send money', async () => {
                const additionalEntrants = 3
                const startingAccountIndex = 1 // since deployer is at 0
                const accounts = await ethers.getSigners()
                let startingWinnerBalance
                for (let i = startingAccountIndex; i < startingAccountIndex + additionalEntrants; i++) {
                    const accountConnectedRaffle = raffle.connect(accounts[i])
                    await accountConnectedRaffle.enterRaffle({value: raffleEntranceFee})
                }
                const startingTimeStamp = await raffle.getLatestTimeStamp()
                await new Promise(async (resolve, reject) => {
                    raffle.once("WinnerPicked", async () => {
                        console.log("Found the event!")
                        try {
                            const recentWinner = await raffle.getRecentWinner()
                            const raffleState = await raffle.getRaffleState()
                            const endingTimeStamp = await raffle.getLatestTimeStamp()
                            const numPlayers = await raffle.getNumberOfPlayers()

                            assert.equal(numPlayers, 0)
                            assert.equal(raffleState, 0 /* RaffleState.OPEN */)
                            assert.isAbove(endingTimeStamp, startingTimeStamp)

                            let winnerIndex
                            for (let i = startingAccountIndex; i < startingAccountIndex + additionalEntrants; i++) {
                                if (recentWinner == accounts[i].address) {
                                    winnerIndex = i
                                    break
                                }
                            }

                            assert.isAbove(winnerIndex, 0)
                            console.log("winnerIndex", winnerIndex)

                            const winnerBalance = await ethers.provider.getBalance(accounts[winnerIndex].address)

                            assert.equal(
                                winnerBalance,
                                startingWinnerBalance +
                                raffleEntranceFee * BigInt(additionalEntrants) +
                                raffleEntranceFee
                            )

                            resolve()
                        } catch(e) {
                            reject(e)
                        }
                    })

                    // below we fire the event, and then the listener above will pick it up and resolve
                    const tx = await raffle.performUpkeep("0x")
                    const txReceipt = await tx.wait(1)
                    startingWinnerBalance = await ethers.provider.getBalance(accounts[startingAccountIndex].address) // assuming all starting balances are the samer
                    await vrfCoordinatorV2Mock.fulfillRandomWords(
                        txReceipt.logs[1].args.requestId,
                        raffle.getAddress()
                    )
                })
            })
        })
    })
