import { PublicKey, Keypair } from "@solana/web3.js";
import { processWallet } from '../services/position.service.js';
import { walletInfo } from '../services/wallet.service.js';
import { getFullPosition } from '../utils/GetPosition.js';
import { question } from '../utils/question.js';
import { strategyType } from '../utils/logger.js';
import bs58 from 'bs58';
import { returnToMainMenu } from '../utils/mainMenuReturn.js';
import { displayPositionsTable } from '../services/wallet.service.js';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function handleWalletsWithoutPosition(walletsWithoutPosition, poolAddress, solAmount, strategy = '2') {
    if (walletsWithoutPosition.length === 0) {
        return [];
    }

    const action = await question("\nSelect an action:\n1. Recheck positions\n2. Re-add liquidity\n3. Skip\n\n[...] Your choice (1-3): ");
    
    if (action === "1") {
        console.log("\n\x1b[36m[⌛] | WAITING | Waiting 2 seconds before checking...\x1b[0m");
        await delay(2000);
        
        const remainingWallets = [];
        const retryPromises = walletsWithoutPosition.map(async wallet => {
            const user = Keypair.fromSecretKey(new Uint8Array(bs58.decode(wallet.privateKey)));
            const position = await getFullPosition(user, new PublicKey(poolAddress));
            
            if (!position) {
                remainingWallets.push(wallet);
            }
        });

        await Promise.all(retryPromises);
        
        if (remainingWallets.length > 0) {
            return await handleWalletsWithoutPosition(remainingWallets, poolAddress, solAmount, strategy);
        } else {
            console.log("\n\x1b[36m[${new Date().toLocaleTimeString()}] | SUCCESS | All positions checked successfully\x1b[0m");
            return [];
        }
    } else if (action === "2") {
        const retryPromises = walletsWithoutPosition.map(async wallet => {
            try {                
                const user = Keypair.fromSecretKey(new Uint8Array(bs58.decode(wallet.privateKey)));
                let position = await getFullPosition(user, new PublicKey(poolAddress));
                if (!position) {
                    await processWallet(wallet, poolAddress, solAmount, strategy);
                    position = await getFullPosition(user, new PublicKey(poolAddress));
                } else {
                    console.log(`\n\x1b[36m[${new Date().toLocaleTimeString()}] | SUCCESS | [${wallet.description.slice(0, 4)}...] | Position already created\x1b[0m`);
                }
                
                if (!position) {
                    console.log(`\n\x1b[31m~~~ [!] | ERROR | [${wallet.description.slice(0, 4)}...] | Position not created on retry\x1b[0m`);
                } else {
                    console.log(`\n\x1b[36m[${new Date().toLocaleTimeString()}] | SUCCESS | [${wallet.description.slice(0, 4)}...] | Position created successfully\x1b[0m`);
                }
            } catch (error) {
                console.error(`\n\x1b[31m~~~ [!] | ERROR | [${wallet.description.slice(0, 4)}...] | Error on retry: ${error.message}\x1b[0m`);
            }
        });

        await Promise.all(retryPromises);
        return walletsWithoutPosition;
    }
    
    return walletsWithoutPosition;
}

export async function handleOpenPosition(selectedWallets, predefinedPool = null, predefinedAmount = null) {
    try {
        !predefinedAmount ? await walletInfo(selectedWallets, false) : null;
        
        const solAmount = predefinedAmount || await question("\n[...] Enter position size in SOL (e.g., 0.1): ");
        const poolAddress = predefinedPool || await question("\n[...] Enter pool address: ");
        const strategy = await strategyType();
        
        try {
            new PublicKey(poolAddress);
        } catch (e) {
            console.error(`\x1b[31m~~~ [!] | ERROR | Invalid pool address\x1b[0m\n`);
            returnToMainMenu();
        }

        // Perform operations and collect wallets without positions
        const walletsWithoutPosition = [];
        
        // Add delay between transactions
        const openPromises = selectedWallets.map(async wallet => {
            try {
                const user = Keypair.fromSecretKey(new Uint8Array(bs58.decode(wallet.privateKey)));
                let position = await getFullPosition(user, new PublicKey(poolAddress));
                if (!position) {
                    await processWallet(wallet, poolAddress, solAmount, strategy);
                    await delay(4000)
                    position = await getFullPosition(user, new PublicKey(poolAddress));
                } else {
                    console.log(`\n\x1b[36m[${new Date().toLocaleTimeString()}] | SUCCESS | [${wallet.description.slice(0, 4)}...] | Position already created\x1b[0m`);
                }
                
                if (!position) {
                    walletsWithoutPosition.push(wallet);
                } else {
                }
            } catch (error) {
                walletsWithoutPosition.push(wallet);
            }
        });

        await Promise.all(openPromises);

        // Process wallets without positions and get updated list
        let finalWalletsWithoutPosition = [];
        if (walletsWithoutPosition.length > 0) {
            console.log("\n\x1b[31m~~~ [!] | ERROR | The following wallets require attention:\x1b[0m");
            walletsWithoutPosition.forEach(wallet => 
                console.log(`- ${wallet.description.slice(0, 4)}...`)
            );
            
            // Save the result of processing
            finalWalletsWithoutPosition = await handleWalletsWithoutPosition(walletsWithoutPosition, poolAddress, solAmount, strategy);
        }

        console.log(`\n\x1b[36m[${new Date().toLocaleTimeString()}] | SUCCESS | Opening positions completed\x1b[0m`);
        
        // Use the updated number of problematic wallets
        console.log("\n\x1b[36m• Final statistics:\x1b[0m");
        console.log(`  └─ \x1b[90mTotal wallets:\x1b[0m ${selectedWallets.length}`);
        console.log(`  └─ \x1b[90mSuccessful:\x1b[0m ${selectedWallets.length - (finalWalletsWithoutPosition?.length || 0)}`);
        console.log(`  └─ \x1b[90mRequire attention:\x1b[0m ${finalWalletsWithoutPosition?.length || 0}`);
        displayPositionsTable(selectedWallets, true);        
    } catch (error) {
        console.error(`\x1b[31m~~~ [!] | ERROR | Error opening position\x1b[0m`);
        returnToMainMenu();
    }
}