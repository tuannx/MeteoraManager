import { displayPositionsTable } from '../services/wallet.service.js';
import { getFullPosition } from '../utils/GetPosition.js';
import { question } from '../utils/question.js';
import { Keypair, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { processWallet, processRemoveLiquidity, processCreateTokenPosition } from '../services/position.service.js';
import { strategyType } from '../utils/logger.js';
import { returnToMainMenu } from '../utils/mainMenuReturn.js';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export async function handleReopenPosition(selectedWallets) {
    try {        
        console.log("\nIN WHAT DO YOU WANT TO REOPEN THE POSITION:\n=========================");
        console.log(`\x1b[36m-+-\x1b[0m 1: IN TOKENS`);
        console.log(`\x1b[36m-+-\x1b[0m 2: IN SOL`);
        
        const positionType = await question("\n[...] Select type (1-2): ");
        
        const poolAddress = await question("\n[...] Enter pool address: ");
        let validPoolAddress;
        try {
            validPoolAddress = new PublicKey(poolAddress.trim());
        } catch (error) {
            console.error(`\x1b[31m~~~ [!] | ERROR | Invalid pool address: ${error.message}\x1b[0m\n`);
            returnToMainMenu();
        }

        let solAmount;
        if (positionType === "2") {
            solAmount = await question("\n[...] Enter new position size in SOL (e.g., 0.1): ");
        }

        const strategy = await strategyType();

        // Check existing positions
        console.log("\n\x1b[36m[⌛] | WAITING | Checking current positions...\x1b[0m");
        const walletsWithPosition = [];

        // Close existing positions
        if (selectedWallets.length > 0) {
            console.log("\n\x1b[36m[⌛] | WAITING | Closing existing positions...\x1b[0m\n");
            const removePromises = selectedWallets.map(async wallet => {
                try {
                    await processRemoveLiquidity(wallet, validPoolAddress);
                } catch (error) {
                    console.error(`\x1b[31m~~~ [!] | ERROR | [${wallet.description.slice(0, 4)}...] Error closing position: ${error.message}\x1b[0m`);
                    returnToMainMenu();
                }
            });
            await Promise.all(removePromises);
        }
        // Check that all positions are closed
        console.log("\n\x1b[36m[⌛] | WAITING | Checking position closures...\x1b[0m\n");
        await delay(2000);
        const remainingPositions = [];
        const verifyClosePromises = selectedWallets.map(async wallet => {
            const user = Keypair.fromSecretKey(new Uint8Array(bs58.decode(wallet.privateKey)));
            const position = await getFullPosition(user, validPoolAddress);
            if (position) {
                remainingPositions.push(wallet);
            }
        });
        await Promise.all(verifyClosePromises);

        if (remainingPositions.length > 0) {
            console.log("\n\x1b[31m~~~ [!] | ERROR | Not all positions were closed successfully:\x1b[0m");
            remainingPositions.forEach(wallet => console.log(`- ${wallet.description.slice(0, 4)}...`));
        }

        // Open new positions
        console.log("\n\x1b[36m[⌛] | WAITING | Opening new positions...\x1b[0m\n");
        const walletsWithoutPosition = [];
        const openPromises = selectedWallets.map(async wallet => {
            try {
                if (positionType === "1") {
                    await processCreateTokenPosition(wallet, validPoolAddress, strategy);
                } else {
                    await processWallet(wallet, validPoolAddress, solAmount, strategy);
                }                
                const user = Keypair.fromSecretKey(new Uint8Array(bs58.decode(wallet.privateKey)));
                const position = await getFullPosition(user, validPoolAddress);
                
                if (!position) {
                    walletsWithoutPosition.push(wallet);
                }
            } catch (error) {
                console.error(`\x1b[31m~~~ [!] | ERROR | Error opening position for ${wallet.description.slice(0, 4)}...: ${error.message}\x1b[0m`);
                walletsWithoutPosition.push(wallet);
            }
        });
        await Promise.all(openPromises);

        // Process wallets without positions
        let finalWalletsWithoutPosition = [];
        if (walletsWithoutPosition.length > 0) {
            console.log("\n\x1b[31m~~~ [!] | ERROR | The following wallets require attention:\x1b[0m");
            walletsWithoutPosition.forEach(wallet => 
                console.log(`- ${wallet.description.slice(0, 4)}...`)
            );

            console.log("\n\x1b[36m[!] | ADVICE | Try rechecking positions 1-2 times, if no positions appear, then re-add liquidity\x1b[0m\n");
            
            const action = await question("\nSelect an action:\n1. Recheck positions\n2. Re-add liquidity\n3. Skip these wallets\n4. Return to main menu\nYour choice (1-4): ");
            
            if (action === "1") {
                const remainingWallets = [];
                const retryPromises = walletsWithoutPosition.map(async wallet => {
                    const user = Keypair.fromSecretKey(new Uint8Array(bs58.decode(wallet.privateKey)));
                    const position = await getFullPosition(user, validPoolAddress);
                    
                    if (!position) {
                        remainingWallets.push(wallet);
                    }
                });

                await Promise.all(retryPromises);
                finalWalletsWithoutPosition = remainingWallets;
                
            } else if (action === "2") {
                const retryPromises = walletsWithoutPosition.map(async wallet => {
                    try {
                        const user = Keypair.fromSecretKey(new Uint8Array(bs58.decode(wallet.privateKey)));
                        let position = await getFullPosition(user, validPoolAddress);
                        if (position) {
                            console.log(`\n\x1b[36m[${new Date().toLocaleTimeString()}] | SUCCESS | [${wallet.description.slice(0, 4)}...] | Position already created\x1b[0m`);
                            return null;
                        }
                        await processWallet(wallet, validPoolAddress, solAmount, strategy);                        
                        position = await getFullPosition(user, validPoolAddress);
                        
                        if (!position) {
                            console.log(`\n\x1b[31m~~~ [!] | ERROR | [${wallet.description.slice(0, 4)}...] | Position not created on retry\x1b[0m`);
                            return wallet;
                        } else {
                            console.log(`\n\x1b[36m[${new Date().toLocaleTimeString()}] | SUCCESS | [${wallet.description.slice(0, 4)}...] | Position created successfully\x1b[0m`);
                            return null;
                        }
                    } catch (error) {
                        console.error(`\n\x1b[31m~~~ [!] | ERROR | [${wallet.description.slice(0, 4)}...] | Error on retry: ${error.message}\x1b[0m`);
                        return wallet;
                    }
                });

                const results = await Promise.all(retryPromises);
                finalWalletsWithoutPosition = results.filter(wallet => wallet !== null);
            } else if (action === "3") {
                finalWalletsWithoutPosition = walletsWithoutPosition;
            } else {
                returnToMainMenu();
            }
        }

        // Update statistics with retries
        console.log("\n\x1b[36m• Reopening positions completed\x1b[0m");
        console.log("\n\x1b[36m• Final statistics:\x1b[0m");
        console.log(`  └─ \x1b[90mTotal wallets:\x1b[0m ${selectedWallets.length}`);
        console.log(`  └─ \x1b[90mSuccessfully reopened:\x1b[0m ${selectedWallets.length - finalWalletsWithoutPosition.length}`);
        console.log(`  └─ \x1b[90mRequire attention:\x1b[0m ${finalWalletsWithoutPosition.length}`);

        if (finalWalletsWithoutPosition.length > 0) {
            console.log("\n\x1b[36m• Wallets requiring attention:\x1b[0m");
            finalWalletsWithoutPosition.forEach(wallet => 
                console.log(`  └─ ${wallet.description.slice(0, 4)}...`)
            );
        }

        await displayPositionsTable(selectedWallets, true);        
    } catch (error) {
        console.error(`\x1b[31m~~~ [!] | ERROR | Error reopening position: ${error.message}\x1b[0m`);
        returnToMainMenu();
    }
}