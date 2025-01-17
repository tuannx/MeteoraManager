import pkg from '@solana/web3.js';
const { Keypair, LAMPORTS_PER_SOL } = pkg;
import bs58 from 'bs58';
import { getTokenInfoByTokenAddress, formatNumber, getSolPrice } from './utils.service.js';
import { getConnection, TOKEN_PROGRAM_ID } from '../config/index.js';
import { question } from '../utils/question.js';
import { getPositions } from '../utils/GetPosition.js';
import { handleRemovePosition } from '../actions/RemovePosition.js';
import { handleTokenConsolidation } from '../actions/TokenOperations.js';
import { handleSolConsolidation, handleSolDistribution } from '../actions/SolOperations.js';
import { processClaimRewards } from './position.service.js';
import { WALLETS } from '../config/index.js';
import { handleSwapTokens } from '../actions/SwapTokens.js';
import { displayLogo, selectWallets } from '../utils/logger.js';
import { returnToMainMenu } from '../utils/mainMenuReturn.js';
import { handleReopenPosition } from '../actions/ReopenPosition.js';

export async function displayPositionsTable(wallets,positionCheck = true) {
    const tableData = [];
    const solPrice = await getSolPrice();
    let totalPositionsValue = 0;
    let totalFeesValue = 0;
    const uniquePools = new Map();
    const promises = wallets.map(async (wallet) => {
        await new Promise(resolve => { setTimeout(resolve, 1000 + Math.random() * 1000) });
        const user = Keypair.fromSecretKey(new Uint8Array(bs58.decode(wallet.privateKey)));
        const positions = await getPositions(user);
        
        if (positions && positions.length > 0) {
            for (const position of positions) {
                uniquePools.set(position.poolAddress, position.poolInfo.name);
                
                const token1Amount = position.amounts.token1;
                const token2Amount = position.amounts.token2;
                const positionToken1 = position.amounts.positionToken1;
                const positionToken2 = position.amounts.positionToken2;
                
                const tokenFeeUSD = position.poolInfo.currentPrice * token1Amount * solPrice;
                const solFeeUSD = solPrice * token2Amount;
                const totalFeeUSD = tokenFeeUSD + solFeeUSD;

                const pool = positionCheck ? position.poolAddress.slice(0, 4) + '..' : position.poolAddress;

                const positionToken1USD = position.poolInfo.currentPrice * positionToken1 * solPrice;
                const positionToken2USD = solPrice * positionToken2;
                const totalPositionUSD = positionToken1USD + positionToken2USD;
                totalPositionsValue += totalPositionUSD;
                totalFeesValue += totalFeeUSD;
                const currentTokenPrice = 1 / Number(position.binPrices.current);
                const upperTokenPrice = 1 / Number(position.binPrices.upper);
                const percentFromCurrent = ((upperTokenPrice - currentTokenPrice) / currentTokenPrice * 100).toFixed(2);
                const priceIndicator = `${percentFromCurrent > 0 ? '+' : ''}${percentFromCurrent}%`;

                tableData.push({
                    '👛 WALLET': wallet.description.slice(0, 4) + '..',
                    '🏊 POOL': pool,
                    '📊 VOL-24h': `${formatNumber(position.poolInfo.tradeVolume24h)}`,
                    '📊 FEES-24h': `$${formatNumber(position.poolInfo.fees24h)}`,
                    '🪙 TOKEN/PRICE': `${position.poolInfo.name.split('-')[0]} / $${Number(position.poolInfo.currentPrice).toFixed(8)} (${priceIndicator})`,
                    '📈 RANGE': `${Number(position.binPrices.lower).toFixed(8)} - ${Number(position.binPrices.upper).toFixed(8)}`,
                    '💱 TOKEN/SOL-VALUE': `${formatNumber(positionToken1.toFixed(4))} / ${formatNumber(positionToken2.toFixed(4))} SOL`,
                    '🤑 TOTAL-VALUE': `$${totalPositionUSD.toFixed(2)}`,
                    '💱 TOKEN/SOL-FEE': `${token1Amount.toFixed(3)} / ${token2Amount.toFixed(3)} SOL`,
                    '🤑 TOTAL-FEE': `$${totalFeeUSD.toFixed(2)}`,
                });
            }
        }
    });

    await Promise.all(promises);

    if (tableData.length > 0) {
        if (positionCheck) {
            await displayLogo();
        }
        console.log("\n\x1b[36m | POSITIONS INFORMATION\x1b[0m");
        console.table(tableData);
        console.log(`\n\x1b[36m-+-\x1b[0m TOTAL VALUE OF ALL POSITIONS: \x1b[32m$${formatNumber(totalPositionsValue.toFixed(2))}\x1b[0m`);
        console.log(`\x1b[36m-+-\x1b[0m TOTAL AMOUNT OF ALL FEES: \x1b[32m$${formatNumber(totalFeesValue.toFixed(2))}\x1b[0m`);
        
        console.log("\n\x1b[36m-+-\x1b[0m LIST OF POOLS:");
        uniquePools.forEach((name, pool) => {
            console.log(`
\x1b[36m• POOL: \x1b[0m${name}
  └─ \x1b[90mAddress:\x1b[0m ${pool}
  └─ \x1b[90mLinks:\x1b[0m
     • \x1b[34mPhoton\x1b[0m: https://photon-sol.tinyastro.io/en/lp/${pool}
     • \x1b[34mMeteora\x1b[0m: https://app.meteora.ag/dlmm/${pool}
`);
        });
        if (positionCheck) {
            const Choice = await question("\n[...] Select an action: \n1: Close positions\n2: Close positions and sell all tokens\n3: Reopen positions\n4: Recheck\n5: Claim fees\n6: Return to main menu\n\n[...] Select an action (1-6): ");
            if (Choice === '1') {
                const predefinedPool = await question("\n[...] Enter pool address: ");
                await handleRemovePosition(wallets, predefinedPool);
            } else if (Choice === '2') {
                const predefinedPool = await question("\n[...] Enter pool address: ");
                await handleRemovePosition(wallets, predefinedPool);
                await handleSwapTokens(wallets, '2', '1');
            } else if (Choice === '3') {
                await handleReopenPosition(wallets);
            } else if (Choice === '4') {
                await displayPositionsTable(wallets, true);
            } else if (Choice === '5') {
                const poolAddress = await question("\n[...] Enter pool address: ");
                const sellChoice = await question("\n[...] Sell claimed tokens?\n1: Yes\n2: No\n\n[...] Your choice (1-2): ");
                if (sellChoice === '1') {
                    await processClaimRewards(wallets, poolAddress, false);
                    await handleSwapTokens(wallets, '2', '1');
                } else {
                    await processClaimRewards(wallets, poolAddress, true);
                }
            } else {
                returnToMainMenu();
            }
        }
    } else {
        console.log("\n[!] No active positions to display");
        returnToMainMenu();
    }
}

export async function walletInfo(wallets, positionCheck = true) {
    const tableData = [];
    const solBalances = [];
    let totalUsdValue = 0;
    const solPrice = await getSolPrice();
    console.log("\n[⌛] Getting wallet information...");

    const promises = wallets.map(async (wallet) => {
        try {
            const conn = await getConnection();
            await new Promise(resolve => { setTimeout(resolve, 1000 + Math.random() * 1000) });
            const user = Keypair.fromSecretKey(new Uint8Array(bs58.decode(wallet.privateKey)));
            
            // Get SOL balance
            const solBalance = await conn.getBalance(user.publicKey);
            const solValue = (solBalance / LAMPORTS_PER_SOL).toFixed(4);
            const solUsdValue = (solValue * solPrice).toFixed(2);
            
            solBalances.push({
                "Wallet address": user.publicKey.toString(),
                "SOL": solValue,
                "USD": `$${solUsdValue}`
            });
            totalUsdValue += parseFloat(solUsdValue);

            if (positionCheck) {    // Get tokens
                const tokens = await conn.getParsedTokenAccountsByOwner(
                    user.publicKey,
                    { programId: TOKEN_PROGRAM_ID }
                );

                const tokenPromises = tokens.value.map(async ({ account }) => {
                    const tokenInfo = account.data.parsed.info;
                    const tokenAmount = tokenInfo.tokenAmount;

                    if (tokenAmount.uiAmount > 0) {
                        try {
                            const tokenData = await getTokenInfoByTokenAddress(tokenInfo.mint);
                            if (tokenData.priceUSD !== "0") {
                                const usdValue = (tokenAmount.uiAmount * parseFloat(tokenData.priceUSD)).toFixed(2);
                                
                                tableData.push({
                                    "Wallet address": user.publicKey.toString().slice(0, 4) + '..',
                                    "Token": tokenData.tokenSymbol,
                                    "Token address": tokenInfo.mint,
                                    "Amount": formatNumber(tokenAmount.uiAmount),
                                    "Price": `$${tokenData.priceUSD}`,
                                    "Value": `$${formatNumber(parseFloat(usdValue))}`
                                });
                                
                                totalUsdValue += parseFloat(usdValue);
                            }
                        } catch (error) {
                            console.log(`~~~ [!] [${user.publicKey.toString().slice(0, 4)}..] Skipped token ${tokenInfo.mint}: no price data | utils.js`);
                        }
                    }
                });
                await Promise.all(tokenPromises);
            }
        } catch (error) {
            console.error(`~~~ [!] [${wallet.description.slice(0, 4)}..] Error processing wallet | UserInfo.js`);
        }
    });

    await Promise.all(promises);

    if (positionCheck) {
        await displayLogo();
    }

    if (solBalances.length > 0) {
        console.log("\n\x1b[36m-+-\x1b[0m SOL BALANCES:");
        console.table(solBalances);
    }

    if (tableData.length > 0) {
        console.log("\n\x1b[36m-+-\x1b[0m TOKEN BALANCES:");
        console.table(tableData);
    }

    if (positionCheck) {
        console.log(`\n\x1b[36m-+-\x1b[0m TOTAL VALUE OF ALL ASSETS: \x1b[32m$${formatNumber(totalUsdValue)}\x1b[0m`);

        // Updated action menu
        const choice = await question("\n[...] Select an action:\n1. Buy/sell tokens\n2. Consolidate tokens\n3. Consolidate SOL\n4. Distribute SOL\n5: Refresh balance\n6: Return to main menu\n\n[...] Select an action (1-6): ");

        switch (choice) {
            case '1':
                const FastWalletsWay = await question("\n[...] Use all wallets\n1: Yes\n2: No\nSelect: ");
                const selectedWallets = FastWalletsWay === '1' ? Object.values(WALLETS) : await selectWallets();
                await handleSwapTokens(selectedWallets);
                break;
            case '2':
                await handleTokenConsolidation(wallets[0], wallets);
                break;
            case '3':
                await handleSolConsolidation(wallets[0], wallets);
                break;
            case '4':
                await handleSolDistribution(wallets[0], wallets);
                break;
            case '5':
                await walletInfo(wallets, true);
                break;
            case '6':
                console.log("\n=== Work completed");
                returnToMainMenu();
                break;
            default:
                console.log("\n[!] Incorrect choice");
                returnToMainMenu();
        }
    }
}

export async function showAvailablePools(wallets) {
    const uniquePools = new Map();

    const promises = wallets.map(async (wallet) => {
        await new Promise(resolve => { setTimeout(resolve, 1000 + Math.random() * 1000) });
        const user = Keypair.fromSecretKey(new Uint8Array(bs58.decode(wallet.privateKey)));
        const positions = await getPositions(user);
        
        if (positions && positions.length > 0) {
            for (const position of positions) {
                uniquePools.set(position.poolAddress, position.poolInfo.name);
            }
        }
    });

    await Promise.all(promises);

    if (uniquePools.size > 0) {
        console.log("\n\x1b[36m-+-\x1b[0m LIST OF POOLS:");
        uniquePools.forEach((name, pool) => {
            console.log(`
\x1b[36m• POOL: \x1b[0m${name}
  └─ \x1b[90mAddress:\x1b[0m ${pool}
  └─ \x1b[90mLinks:\x1b[0m
     • \x1b[34mPhoton\x1b[0m: https://photon-sol.tinyastro.io/en/lp/${pool}
     • \x1b[34mMeteora\x1b[0m: https://app.meteora.ag/dlmm/${pool}
`);
        });
        return true;
    } else {
        console.log("\n[!] No active positions to display");
        return false;
    }
}