import { encodeFunctionData, erc20Abi, getAbiItem, http, PublicClient, toFunctionSelector, toHex } from "viem"; 
import { tokenAddress, publicClientSepolia, nexusClient, account, bundlerUrl, bybitSessionOwner } from "./config";
import { toSmartSessionsValidator, smartSessionCreateActions, CreateSessionDataParams, ParamCondition, SessionData, createNexusSessionClient, smartSessionUseActions, isPermissionEnabled } from "@biconomy/sdk";
import { SmartSessionMode } from "@rhinestone/module-sdk";
import { baseSepolia } from "viem/chains";

const tokenAmount = BigInt(10*10**6) // it has 6 decimals

async function sendBasicERC20Transaction() {    
    const accountBalanceBefore = await publicClientSepolia.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [account.address],
    })

    const hash = await nexusClient.sendTransaction({ 
        calls: [
            { 
                abi: erc20Abi, 
                functionName: 'transfer', 
                to: tokenAddress,   
                args: [account.address, tokenAmount],
            } 
        ], 
    }); 

    const receipt = await nexusClient.waitForTransactionReceipt({ hash }); 

    const accountBalanceAfter = await publicClientSepolia.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [account.address],
    })

    console.log("difference ", accountBalanceAfter - accountBalanceBefore)
}

async function useSmartSessions() {

    const ssTokenAmount = BigInt(15*10**6) // it has 6 decimals

    const accountBalanceBefore = await publicClientSepolia.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [account.address],
    })

    const sessionsModule = toSmartSessionsValidator({ 
        account: nexusClient.account,
        signer: account
    });

    // INSTALL THE MODULE IF IT IS NOT INSTALLED
    const installed = await nexusClient.isModuleInstalled({
        module: {
          type: "validator",
          address: sessionsModule.module
        }
      })
    
    if (!installed) {
        const hash = await nexusClient.installModule({ 
            module: sessionsModule.moduleInitData
        })
        const { success: installSuccess } = await nexusClient.waitForUserOperationReceipt({ hash });
    } else {
        console.log("module already installed")
    }

    const nexusSessionClient = nexusClient.extend(smartSessionCreateActions(sessionsModule));

    const bybitSessionPublicKey = bybitSessionOwner.address;

    /*
     Rules:
        Define permitted values for the function arguments
    */
    const rules = [
        {
          // sets the rule for the receiver address
          // in this case, the receiver address should equal to the account address
          offsetIndex: 0,  // 'to' address parameter
          condition: ParamCondition.EQUAL,
          isLimited: false,
          ref: account.address,
          usage: {
            limit: BigInt(0),
            used: BigInt(0)
          }
        },
        {
            // Limit USD amount per transaction and per session
            condition: ParamCondition.LESS_THAN_OR_EQUAL,
            offsetIndex: 1, // value is the second argument of the transfer function
            isLimited: true,
            ref: 100 * 10**6, //not more than 100 USD per transaction
            usage: {
              limit: BigInt(10000 * 10**6), //not more than 10,000 USD per session
              used: BigInt(0)
            }
        }
      ];
      
    // create the session
    const sessionRequestedInfo: CreateSessionDataParams[] = [
        {
            sessionPublicKey: bybitSessionPublicKey,
            actionPoliciesInfo: [{
                contractAddress: tokenAddress, 
                rules,
                functionSelector: toFunctionSelector(getAbiItem({abi: erc20Abi, name: "transfer"}))
            }],
            salt: toHex(111, {size: 32})
        }
    ];
 
    const createSessionsResponse = await nexusSessionClient.grantPermission({
        sessionRequestedInfo
    });
 
    const [cachedPermissionId] = createSessionsResponse.permissionIds;
    console.log("cachedPermissionId ", cachedPermissionId)

    // CHECK THAT THE PERMISSION HAS NOT YET BEEN GRANTED
    //const permissionEnabled = await isPermissionEnabled({client: nexusClient.account.client as PublicClient, accountAddress: nexusClient.account.address, permissionId: cachedPermissionId});
    const permissionEnabled = await isPermissionEnabled(
        {
            client: nexusClient.account.client as PublicClient,
            accountAddress: nexusClient.account.address, 
            permissionId: cachedPermissionId
        }
    ); 

    if (!permissionEnabled) {
        const { success: grantPermissionSuccess } = await nexusClient.waitForUserOperationReceipt({ 
            hash: createSessionsResponse.userOpHash
        });
    } else {
        console.log("permission already enabled")
    }
 
    const sessionData: SessionData = {
        granter: nexusClient.account.address,
        sessionPublicKey: bybitSessionPublicKey,
        moduleData: {
            permissionIds: [cachedPermissionId],
            mode: SmartSessionMode.USE
        }
    };

    // USE THE SESSION
    console.log("Sending userOp that uses the session enabled before");

    const smartSessionNexusClient = await createNexusSessionClient({
        chain: baseSepolia,
        accountAddress: sessionData.granter,
        signer: bybitSessionOwner,
        transport: http(),
        bundlerTransport: http(bundlerUrl)
    });

    const usePermissionsModule = toSmartSessionsValidator({
        account: smartSessionNexusClient.account,
        signer: bybitSessionOwner,
        moduleData: sessionData.moduleData
    });
     
    const useSmartSessionNexusClient = smartSessionNexusClient.extend(
        smartSessionUseActions(usePermissionsModule)
    );

    const usePermissionUserOpHash = await useSmartSessionNexusClient.usePermission({
        calls: [
            {   
                // transfer USD , signed by the session key
                to: tokenAddress,
                value: 0n,
                data: encodeFunctionData({
                    abi: erc20Abi,
                    functionName: "transfer",
                    args: [account.address, ssTokenAmount]
                })
            }
        ]
    });

    const { success: sessionUseSuccess, receipt: sessionUseReceipt } =
      await useSmartSessionNexusClient.waitForUserOperationReceipt({
        hash: usePermissionUserOpHash
    })

    const accountBalanceAfter = await publicClientSepolia.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [account.address],
    })

    // was usd amount transferred?
    console.log("difference ", accountBalanceAfter - accountBalanceBefore)

}

useSmartSessions()