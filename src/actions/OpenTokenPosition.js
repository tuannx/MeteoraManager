import { PublicKey, Keypair } from "@solana/web3.js";
import { processCreateTokenPosition } from '../services/position.service.js';
import { strategyType } from '../utils/logger.js';
import { getFullPosition } from '../utils/GetPosition.js';
import { question } from '../utils/question.js';
import bs58 from 'bs58';
import { returnToMainMenu } from '../utils/mainMenuReturn.js';
import { logWalletsTokensPools } from './PoolOperations.js';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function handleWalletsWithoutPosition(walletsWithoutPosition, poolAddress, strategy = '2') {
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
            return await handleWalletsWithoutPosition(remainingWallets, poolAddress, strategy);
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
                    await processCreateTokenPosition(wallet, poolAddress, strategy);
                }
                
                position = await getFullPosition(user, new PublicKey(poolAddress));
                
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

export async function handleOpenTokenPosition(selectedWallets, predefinedPool = null) {
    try {
        let poolAddress;
        if (!predefinedPool) {
            await logWalletsTokensPools(selectedWallets);
            poolAddress = await question("\n[...] Enter pool address: ");
        } else {
            poolAddress = predefinedPool;
        }

        const strategy = await strategyType();
        
        try {
            new PublicKey(poolAddress);
        } catch (e) {
            console.error("\x1b[31m~~~ [!] | ERROR | Invalid pool address\x1b[0m");
            returnToMainMenu();
        }

        const walletsWithoutPosition = [];
        
        const openPromises = selectedWallets.map(async wallet => {
            try {
                const user = Keypair.fromSecretKey(new Uint8Array(bs58.decode(wallet.privateKey)));
                let position = await getFullPosition(user, new PublicKey(poolAddress));
                if (!position) {
                    await processCreateTokenPosition(wallet, poolAddress, strategy);
                }
                position = await getFullPosition(user, new PublicKey(poolAddress));
                if (!position) {
                    walletsWithoutPosition.push(wallet);
                }
            } catch (error) {
                walletsWithoutPosition.push(wallet);
            }
        });

        await Promise.all(openPromises);

        let finalWalletsWithoutPosition = [];
        if (walletsWithoutPosition.length > 0) {
            console.log("\n\x1b[31m~~~ [!] | ERROR | The following wallets require attention:\x1b[0m");
            walletsWithoutPosition.forEach(wallet => 
                console.log(`- ${wallet.description.slice(0, 4)}...`)
            );
            
            finalWalletsWithoutPosition = await handleWalletsWithoutPosition(walletsWithoutPosition, poolAddress, strategy);
        }

        console.log(`\n\x1b[36m[${new Date().toLocaleTimeString()}] | SUCCESS | Opening positions completed\x1b[0m`);
        
        console.log("\n\x1b[36m• Final statistics:\x1b[0m");
        console.log(`  └─ \x1b[90mTotal wallets:\x1b[0m ${selectedWallets.length}`);
        console.log(`  └─ \x1b[90mSuccessful:\x1b[0m ${selectedWallets.length - (finalWalletsWithoutPosition?.length || 0)}`);
        console.log(`  └─ \x1b[90mRequire attention:\x1b[0m ${finalWalletsWithoutPosition?.length || 0}`);
        
        returnToMainMenu();
        
    } catch (error) {
        console.error(`\x1b[31m~~~ [!] | ERROR | Ошибка при открытии позиции: ${error.message}\x1b[0m`);
        returnToMainMenu();
    }
}