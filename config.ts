import dotenv from "dotenv"
import { privateKeyToAccount } from "viem/accounts";
import { createNexusClient } from "@biconomy/sdk"; 
import { baseSepolia } from "viem/chains"; 
import { createPublicClient, http } from "viem"; 

dotenv.config()

export const publicClientSepolia = createPublicClient({
    chain: baseSepolia,
    transport: http(),
})

export const account = privateKeyToAccount(`0x${process.env.PRIVATE_KEY}`)

export const bundlerUrl = "https://bundler.biconomy.io/api/v3/84532/nJPK7B3ru.dd7f7861-190d-41bd-af80-6877f74b8f44"; 
 
export const nexusClient = await createNexusClient({ 
    signer: account, 
    chain: baseSepolia, 
    transport: http(), 
    bundlerTransport: http(bundlerUrl), 
});

export const smartAccountAddress = nexusClient.account.address;

console.log("Nexus: ", smartAccountAddress)
// 0x74430Ed9bd0eEF5d6AE744124298D35A66002A08

export const tokenAddress = "0x323e78f944A9a1FcF3a10efcC5319DBb0bB6e673"

export const bybitSessionOwner = privateKeyToAccount(`0x${process.env.BYBIT_SESSION_OWNER_PRIVATE_KEY}`)