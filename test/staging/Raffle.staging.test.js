const { assert } = require("chai")
const { network, deployments, ethers, getNamedAccounts} = require("hardhat")
const { developmentChains } = require("../../helper-hardhat-config")

developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle", function () {
        let raffle, raffleEntranceFee, deployer

        beforeEach(async function () {
            deployer = (await getNamedAccounts()).deployer

            const raffleDeployment = await deployments.get("Raffle")
            raffle = await ethers.getContractAt(
                raffleDeployment.abi,
                raffleDeployment.address
            )

            raffleEntranceFee = await raffle.getEntranceFee()
        })

        describe("fulfillRandomWords", function () {
            it('should work with live Chainlink Automation and VRF, we get a random winner', async () => {
                console.log("Setting up test...")
                const startingTimeStamp = await raffle.getLatestTimeStamp()
                const accounts = await ethers.getSigners()

                console.log("Setting up Listener...")
                await new Promise(async (resolve, reject) => {
                    // setup a listener before entering the raffle
                    raffle.once("WinnerPicked", async function () {
                        console.log("WinnerPicked event fired!")
                        try {
                            const recentWinner = await raffle.getRecentWinner()
                            const raffleState = await raffle.getRaffleState()
                            const winnerEndingBalance = await ethers.provider.getBalance(accounts[0].address)
                            const endingTimeStamp = await raffle.getLatestTimeStamp()

                            assert.equal(await raffle.getNumberOfPlayers(), 0)
                            assert.equal(recentWinner, accounts[0].address)
                            assert.equal(raffleState, 0 /* RaffleState.OPEN */)
                            assert.equal(winnerEndingBalance, winnerStartingBalance + raffleEntranceFee)
                            assert.isAbove(endingTimeStamp, startingTimeStamp)

                            resolve()
                        } catch (e) {
                            console.error(e)
                            reject(e)
                        }
                    })

                    console.log("Entering Raffle...")
                    const tx = await raffle.enterRaffle({ value: raffleEntranceFee })
                    await tx.wait(1)
                    console.log("Ok, time to wait...")
                    const winnerStartingBalance = await ethers.provider.getBalance(accounts[0].address)

                    // this code will not complete until our listener has finished
                })
            })
        })
    })