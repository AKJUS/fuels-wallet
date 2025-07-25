import { cssObj } from '@fuel-ui/css';
import { Box, Button, Input, InputAmount, Link, Text } from '@fuel-ui/react';
import { useAssets, useFuel, useIsConnected } from '@fuels/react';
import type { BN } from 'fuels';
import { Address, Provider, bn, buildBlockExplorerUrl } from 'fuels';
import { useEffect, useMemo, useState } from 'react';

import { ExampleBox } from '../../src/components/ExampleBox';
import { useLoading } from '../../src/hooks/useLoading';
import { getAssetByChain } from '../../src/utils/getAssetByChain';

const DEFAULT_PROVIDER_URL = 'https://testnet.fuel.network/v1/graphql';
const ENV_PROVIDER_URL = process.env.NEXT_PUBLIC_FUEL_PROVIDER_URL;
const FUEL_PROVIDER_URL =
  ENV_PROVIDER_URL ||
  (typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? 'http://localhost:4000/v1/graphql'
    : DEFAULT_PROVIDER_URL);

export function TransferAssets() {
  const { fuel } = useFuel();
  const { isConnected } = useIsConnected();
  const { assets } = useAssets();
  const [txId, setTxId] = useState<string>('');
  const [providerUrl, setProviderUrl] = useState<string>('');
  const [amount, setAmount] = useState<BN | null>(bn.parseUnits('0.00001'));
  const [receiverAddress, setAddr] = useState<string>(
    '0xeeb709945b9058c3d50f3922bd1b49f92ced2950a9ecaf810aa7829295550cd2'
  );
  const [assetId, setAssetId] = useState<string>();
  const decimals = useMemo(() => {
    const asset = assets
      .map((asset) => getAssetByChain(asset, 0))
      .find((asset) => asset?.assetId === assetId);
    return asset?.decimals || 0;
  }, [assetId, assets]);

  useEffect(() => {
    let abort = false;
    const provider = new Provider(FUEL_PROVIDER_URL);
    provider
      .getBaseAssetId()
      .then((baseAssetId) => {
        if (abort) return;
        setAssetId(baseAssetId);
      })
      .catch((err) => {
        console.error('Failed to connect to Fuel provider', err);
      });
    return () => {
      abort = true;
    };
  }, []);

  const [sendTransaction, sendingTransaction, errorSendingTransaction] =
    useLoading(async (amount: BN, _addr: string, assetId: string) => {
      if (!isConnected) await fuel.connect();
      console.log('Request signature transaction!');
      /* transferAsset:start */
      // Retrieve the current account address
      const account = await fuel.currentAccount();
      // If the current account is null this means the user has not authorized
      // the currentAccount to the connection.
      if (!account) {
        throw new Error('Current account not authorized for this connection!');
      }
      // Create a Wallet instance from the current account
      const wallet = await fuel.getWallet(account);
      // Create a Address instance to the receiver address
      const toAddress = Address.fromString(receiverAddress);
      // Send a transaction to transfer the asset to the receiver address
      const response = await wallet.transfer(toAddress, amount, assetId, {
        gasLimit: 5_000,
      });
      console.log('Transaction created!', response.id);
      /* transferAsset:end */
      setProviderUrl(wallet.provider.url);
      setTxId(response.id);
    });

  return (
    <ExampleBox error={errorSendingTransaction}>
      <Box.Stack css={{ gap: '$4' }}>
        <Box.Flex gap="$4" direction={'column'}>
          <Text css={styles.label}>Asset ID:</Text>
          <Input css={{ width: '100%' }}>
            <Input.Field
              value={assetId}
              placeholder={'Asset ID to transfer'}
              onChange={(e) => {
                setAmount(null);
                setAssetId(e.target.value);
              }}
            />
          </Input>
          <Text css={styles.label}>Address to transfer:</Text>
          <Input css={{ width: '100%' }}>
            <Input.Field
              value={receiverAddress}
              placeholder={'Address to transfer'}
              onChange={(e) => setAddr(e.target.value)}
            />
          </Input>
          <Text css={styles.label}>Amount:</Text>
          {decimals ? (
            <InputAmount
              // Force component to re-render when decimals change
              // Remove this once fuel-ui InputAmount is fixed
              // TODO: https://github.com/FuelLabs/fuel-ui/issues/323
              key={decimals}
              value={amount}
              onChange={(value) => setAmount(value as unknown as BN | null)}
              hiddenBalance
              units={decimals}
            />
          ) : (
            <Input css={{ width: '100%' }}>
              <Input.Field
                type="number"
                value={amount?.toString()}
                min={0}
                onChange={(e) => {
                  const ignore = /[.,\-+]/g;
                  const val = (e.target.value || '').replaceAll(ignore, '');
                  setAmount(val ? bn(val) : null);
                }}
                placeholder={'Asset amount'}
              />
            </Input>
          )}
          <Box>
            <Button
              onClick={() =>
                amount &&
                assetId &&
                sendTransaction(amount, receiverAddress, assetId)
              }
              isLoading={sendingTransaction}
              isDisabled={sendingTransaction || !fuel}
            >
              Transfer
            </Button>
          </Box>
        </Box.Flex>
        {txId ? (
          <Box css={styles.accounts}>
            <Text>{txId}</Text>
            <Link
              target={'_blank'}
              href={buildBlockExplorerUrl({
                txId,
                providerUrl,
              })}
            >
              See on BlockExplorer
            </Link>
          </Box>
        ) : null}
      </Box.Stack>
    </ExampleBox>
  );
}

const styles = {
  accounts: cssObj({
    marginTop: '$2',
    padding: '$2',
    borderRadius: '$lg',
    backgroundColor: '$intentsBase4',
    maxWidth: 300,
    wordWrap: 'break-word',
  }),
  label: cssObj({
    fontSize: '$sm',
    mb: '-8px',
  }),
};
