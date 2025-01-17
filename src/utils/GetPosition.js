import pkg from "@meteora-ag/dlmm";
const { default: DLMM } = pkg;
import { connection, getConnection } from '../config/index.js';
import { PublicKey } from '@solana/web3.js';

export async function getPositions(user) {
    try {
        const conn = await getConnection();
        const positions = await DLMM.getAllLbPairPositionsByUser(conn, user.publicKey);
        
        if (positions.size === 0) {
            return [];
        }

        const simplifiedPositions = [];
        
        for (const [posPoolAddress, position] of positions.entries()) {
            try {
                const meteoraResponse = await fetch(`https://app.meteora.ag/clmm-api/pair/${posPoolAddress}`);
                const meteoraData = await meteoraResponse.json();
                const conn = await getConnection();
                const token1Decimals = await conn.getTokenSupply(new PublicKey(meteoraData.mint_x));
                const token2Decimals = 9;

                position.lbPairPositionsData.forEach(pos => {
                    const lowerBin = pos.positionData.positionBinData.find(bin => bin.binId === pos.positionData.lowerBinId);
                    const upperBin = pos.positionData.positionBinData.find(bin => bin.binId === pos.positionData.upperBinId);
                    const currentBin = pos.positionData.positionBinData.find(bin => bin.binId === position.lbPair.activeId);

                    if (!lowerBin || !upperBin) return;

                    simplifiedPositions.push({
                        poolAddress: posPoolAddress,
                        binPrices: {
                            lower: lowerBin.pricePerToken,
                            upper: upperBin.pricePerToken,
                            current: currentBin ? currentBin.pricePerToken : '0'
                        },
                        amounts: {
                            token1: Number(pos.positionData.feeX.toString()) / 10 ** token1Decimals.value.decimals,
                            token2: Number(pos.positionData.feeY.toString()) / 10 ** token2Decimals,
                            positionToken1: Number(pos.positionData.totalXAmount) / 10 ** token1Decimals.value.decimals,
                            positionToken2: Number(pos.positionData.totalYAmount) / 10 ** token2Decimals
                        },
                        binID: {
                            lower: pos.positionData.lowerBinId,
                            upper: pos.positionData.upperBinId,
                            current: position.lbPair.activeId
                        },
                        poolInfo: {
                            name: meteoraData.name,
                            x_mint: meteoraData.mint_x,
                            binStep: meteoraData.bin_step,
                            baseFee: meteoraData.base_fee_percentage,
                            fees24h: meteoraData.fees_24h,
                            currentPrice: meteoraData.current_price,
                            liquidity: meteoraData.liquidity,
                            protocolFee: meteoraData.protocol_fee_percentage,
                            tradeVolume24h: meteoraData.trade_volume_24h
                        }
                    });
                });
            } catch (error) {
                console.log(`\x1b[31m~~~ [!] | ERROR | Error getting pool data ${posPoolAddress}: ${error.message}\x1b[0m`);
                continue;
            }
        }

        return simplifiedPositions;
    } catch (error) {
        console.error(`\x1b[31m~~~ [!] | ERROR | [${user.publicKey.toString().slice(0, 4)}...] Error getting positions:`, error);
        return [];
    }
}

export async function getFullPosition(user, poolAddress) {
    try {
        const conn = await getConnection();
        const positions = await DLMM.getAllLbPairPositionsByUser(conn, user.publicKey);
        
        if (positions.size === 0) {
            return null;
        }

        // Getting the full position for a specific pool
        const position = positions.get(poolAddress.toString());
        
        if (!position) {
            return null;
        }

        return position;
    } catch (error) {
        return null;
    }
}