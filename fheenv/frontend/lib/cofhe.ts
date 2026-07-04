import { createCofheConfig, createCofheClient } from "@cofhe/sdk/web";
import { chains } from "@cofhe/sdk/chains";
import { Encryptable, FheTypes } from "@cofhe/sdk";

const config = createCofheConfig({ supportedChains: [chains.sepolia] });
export const cofheClient = createCofheClient(config);
export { Encryptable, FheTypes };
