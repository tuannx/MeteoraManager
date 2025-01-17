import { PublicKey } from "@solana/web3.js";
import { question } from '../utils/question.js';
import { Keypair } from "@solana/web3.js";
import bs58 from 'bs58';
import { getFullPosition } from '../utils/GetPosition.js';
import { processRemoveLiquidity } from '../services/position.service.js';
import { returnToMainMenu } from '../utils/mainMenuReturn.js';
import { displayLogo } from '../utils/logger.js';
import { showAvailablePools } from '../services/wallet.service.js';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function handleWalletsWithPosition(walletsWithPosition, poolAddress) {
    if (walletsWithPosition.length === 0) {
        return [];
    }

    console.log("\n\x1b[31m~~~ [!] | ERROR | The following wallets still have a position:\x1b[0m");
    walletsWithPosition.forEach(wallet => console.log(`- ${wallet.description}`));
    
    const action = await question("\nSelect an action:\n1. Recheck positions\n2. Re-remove liquidity\n3. Skip\n\n[...] Your choice (1-3): ");
    
    if (action === "1" || action === "2") {
        const remainingWallets = [];
        const checkPromises = walletsWithPosition.map(async wallet => {
            if (action === "2") {
                try {
                    await processRemoveLiquidity(wallet, poolAddress);
                } catch (error) {
                    console.error(`\x1b[31m~~~ [!] | ERROR | [${wallet.description.slice(0, 4)}...] | Error during re-removing liquidity: ${error.message}\x1b[0m`);
                }
            }
            
            const user = Keypair.fromSecretKey(new Uint8Array(bs58.decode(wallet.privateKey)));
            const position = await getFullPosition(user, poolAddress);
            if (position) {
                remainingWallets.push(wallet);
            }
        });

        await Promise.all(checkPromises);
        
        if (remainingWallets.length > 0) {
            return await handleWalletsWithPosition(remainingWallets, poolAddress);
        } else {
            console.log(`\n\x1b[36m[${new Date().toLocaleTimeString()}] | SUCCESS | All positions removed successfully\x1b[0m`);
            return [];
        }
    }
    
    return walletsWithPosition; // Return the original list if skip is selected
}

export async function handleRemovePosition(selectedWallets, predefinedPool = null) {
    try {  
        await displayLogo();
        console.log("\n\x1b[36m[⌛] | WAITING | Checking positions in wallets...\x1b[0m\n");
        const poolCheck = predefinedPool ? true : await showAvailablePools(selectedWallets);
        
        if (poolCheck) {   
            const poolAddress = predefinedPool || await question("\n[...] Enter pool address to remove position: ");
            if (!poolAddress || poolAddress.trim() === '') {
                console.error(`\x1b[31m~~~ [!] | ERROR | Pool address cannot be empty\x1b[0m\n`);
                returnToMainMenu();
            }

            let validPoolAddress;
            try {
                validPoolAddress = new PublicKey(poolAddress.trim());
            } catch (error) {
                console.error(`\x1b[31m~~~ [!] | ERROR | Invalid pool address: ${error.message}\x1b[0m\n`);
                returnToMainMenu();
            }

            const walletsWithPosition = [];

            // Remove liquidity
            const removePromises = selectedWallets.map(async wallet => {
                try {
                    await processRemoveLiquidity(wallet, validPoolAddress);
                    await delay(5000);
                } catch (error) {
                    console.error(`\x1b[31m~~~ [!] | ERROR | [${wallet.description.slice(0, 4)}...] | Error removing liquidity: ${error.message}\x1b[0m`);
                }
            });

            await Promise.all(removePromises);

            // Check remaining positions
            let remainingWallets = [];
            const secondCheckPromises = walletsWithPosition.map(async wallet => {
                const user = Keypair.fromSecretKey(new Uint8Array(bs58.decode(wallet.privateKey)));
                const position = await getFullPosition(user, validPoolAddress);
                
                if (position) {
                    remainingWallets.push(wallet);
                }
            });

            await Promise.all(secondCheckPromises);

            // Process remaining wallets
            if (remainingWallets.length > 0) {
                remainingWallets = await handleWalletsWithPosition(remainingWallets, validPoolAddress);
            }

            console.log(`\n\x1b[36m[${new Date().toLocaleTimeString()}] | SUCCESS | Removing positions completed\x1b[0m`);
            
            // Add final statistics
            console.log("\n\x1b[36m• Final statistics:\x1b[0m");
            console.log(`  └─ \x1b[90mTotal wallets with positions:\x1b[0m ${walletsWithPosition.length}`);
            console.log(`  └─ \x1b[90mSuccessfully removed:\x1b[0m ${walletsWithPosition.length - (remainingWallets?.length || 0)}`);
            console.log(`  └─ \x1b[90mRequire attention:\x1b[0m ${remainingWallets?.length || 0}`);

            if (!predefinedPool) {
                returnToMainMenu();
            }
        }
    } catch (error) {
        if (error.message) {
            console.error(`\x1b[31m~~~ [!] | ERROR | Error removing position: ${error.message}\x1b[0m`);
        } else {
            console.error(`\x1b[31m~~~ [!] | ERROR | Unknown error removing position\x1b[0m`);
        }
        returnToMainMenu();
    }
}