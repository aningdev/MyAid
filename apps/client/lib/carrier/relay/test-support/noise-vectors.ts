// Copied from snow 0.10.0's public Noise test vectors:
// ~/.cargo/registry/src/*/snow-0.10.0/tests/vectors/snow.txt and cacophony.txt
// (https://github.com/mcginty/snow, MIT/Apache-2.0). The `source` field names
// the file each vector came from; fields stay hex strings as the files write them.

export interface NoiseVector {
  source: string;
  protocol_name: string;
  init_prologue: string;
  init_psks?: string[];
  init_static: string;
  init_ephemeral: string;
  init_remote_static: string;
  resp_prologue: string;
  resp_psks?: string[];
  resp_static: string;
  resp_ephemeral: string;
  handshake_hash?: string;
  messages: { payload: string; ciphertext: string }[];
}

export const NOISE_VECTORS: NoiseVector[] = [
  {
    protocol_name: "Noise_IK_25519_ChaChaPoly_SHA256",
    init_prologue:
      "5468657265206973206e6f20726967687420616e642077726f6e672e2054686572652773206f6e6c792066756e20616e6420626f72696e672e",
    init_psks: [],
    init_static: "f49f93c5112c0787acc808d61716d7e090e076a58f15a3f78d92773f8dcb473b",
    init_ephemeral: "dae68498c41315cff7e4a34dded8d973199d8f0cf3fcb8b6651c169de77de8be",
    init_remote_static: "2ea5942829bac414e25aa4cbb1bcc43394816ebb1bd12550d7d0eb4415e42951",
    resp_prologue:
      "5468657265206973206e6f20726967687420616e642077726f6e672e2054686572652773206f6e6c792066756e20616e6420626f72696e672e",
    resp_psks: [],
    resp_static: "b790546f98b1e933c48cd01f17e7b281469d46fcacc9a3b584ae65b1d6272e8e",
    resp_ephemeral: "c0875a5b59c8492bd2135e5432d7d484f938e0a1f5009428c4bcb70b2f69f69f",
    messages: [
      {
        payload: "95a8f51c435a9530ff1f30868ed7b23ec952eb513c26a0774fed82d2978a8c81",
        ciphertext:
          "6d21fec9141f3f37cc464e936a48b2d9521b5a44e0f3d960895d3c3fba30282f731f445c25e898e2534ac0536715b24308c108fc46bd260c887b36c3f68e3a05654fc8295c068ed53fb2022560961224e0b10b0835e1efc82fc587cd50f7178fe3d9eb06e0351c6e7334162c10bed670bfa2a105f7b2768a140b3fd597782601",
      },
      {
        payload: "b866b807a6d8b83182b884dbfedc861843c5082bd6e480cb54e4245a72083041",
        ciphertext:
          "e64e1fb8701c4f4bc3850b255fea657d4d835338b059c89acc99628fbe52473b41a4e79e3c1e6abc46bf80f078a005e15d8a3e04f989af3e6cb99b52031165006163ac3e17b928af8c116009d7bf4fb2",
      },
      {
        payload: "e3a4937faef391028f759758b428b57652e0069a8dee64dfed01b60846938740",
        ciphertext:
          "2bebe19102169cdfe79cf41e38930bfd20a5b2fc78ccf33e853ddd939c0983174656eb27b61464a607762848892ca1c0",
      },
      {
        payload: "693972f27b0cb98aeac1fb54d782125431e7540e0cb2fa882cf51a8184d724fd",
        ciphertext:
          "c7c56da33b45d12f4754e17978bd49999c9c8f51d00db460f902aba2e6e245d0c46662f507915de8596f43b1d175f1db",
      },
    ],
    source: "snow.txt",
  },
  {
    protocol_name: "Noise_IK_25519_ChaChaPoly_SHA256",
    init_prologue: "4a6f686e2047616c74",
    init_static: "e61ef9919cde45dd5f82166404bd08e38bceb5dfdfded0a34c8df7ed542214d1",
    init_ephemeral: "893e28b9dc6ca8d611ab664754b8ceb7bac5117349a4439a6b0569da977c464a",
    init_remote_static: "31e0303fd6418d2f8c0e78b91f22e8caed0fbe48656dcf4767e4834f701b8f62",
    resp_prologue: "4a6f686e2047616c74",
    resp_static: "4a3acbfdb163dec651dfa3194dece676d437029c62a408b4c5ea9114246e4893",
    resp_ephemeral: "bbdb4cdbd309f1a1f2e1456967fe288cadd6f712d65dc7b7793d5e63da6b375b",
    handshake_hash: "0b0f68fb0c27e03ce9b97565995ed4838cc0581b762ef72b062f6a546419fad7",
    messages: [
      {
        payload: "4c756477696720766f6e204d69736573",
        ciphertext:
          "ca35def5ae56cec33dc2036731ab14896bc4c75dbb07a61f879f8e3afa4c7944718da798efbcd91528520204f904b9bd6c7413dccdc214d951e15253e39987f18146e8cd0873654207148333479d4d16c289f0294b29960a72f48e0b7bba2e89083169825e59642148d492020664ccf7",
      },
      {
        payload: "4d757272617920526f746862617264",
        ciphertext:
          "95ebc60d2b1fa672c1f46a8aa265ef51bfe38e7ccb39ec5be34069f1448088435361e70b2ed446e6c9ec387d1d6b3b840f194e373979d241b203c4acafccf5",
      },
      {
        payload: "462e20412e20486179656b",
        ciphertext: "050e9f3c8fac16b68dbce8f8c4bfbf6617c897f9ada4aa29aa19c8",
      },
      {
        payload: "4361726c204d656e676572",
        ciphertext: "344233a6cabb7141d80f3da2fedc311d9646bbb0f505afe403a667",
      },
      {
        payload: "4a65616e2d426170746973746520536179",
        ciphertext: "62cdeeb172ad7ade7aa7d9e069da5790f12331bfa00177787a1d0810c67dc3b2b4",
      },
      {
        payload: "457567656e2042f6686d20766f6e2042617765726b",
        ciphertext: "029bead1b40992327044d409d9a1f3ad8f36c3c452775d557e18bbeb2e8dfcead32d514024",
      },
    ],
    source: "cacophony.txt",
  },
  {
    protocol_name: "Noise_IKpsk1_25519_ChaChaPoly_SHA256",
    init_prologue: "4a6f686e2047616c74",
    init_psks: ["54686973206973206d7920417573747269616e20706572737065637469766521"],
    init_static: "e61ef9919cde45dd5f82166404bd08e38bceb5dfdfded0a34c8df7ed542214d1",
    init_ephemeral: "893e28b9dc6ca8d611ab664754b8ceb7bac5117349a4439a6b0569da977c464a",
    init_remote_static: "31e0303fd6418d2f8c0e78b91f22e8caed0fbe48656dcf4767e4834f701b8f62",
    resp_prologue: "4a6f686e2047616c74",
    resp_psks: ["54686973206973206d7920417573747269616e20706572737065637469766521"],
    resp_static: "4a3acbfdb163dec651dfa3194dece676d437029c62a408b4c5ea9114246e4893",
    resp_ephemeral: "bbdb4cdbd309f1a1f2e1456967fe288cadd6f712d65dc7b7793d5e63da6b375b",
    handshake_hash: "3ad252ed6f724c52da3450383b7d8b806c183e1ef157bbe0465ad24997ec4717",
    messages: [
      {
        payload: "4c756477696720766f6e204d69736573",
        ciphertext:
          "ca35def5ae56cec33dc2036731ab14896bc4c75dbb07a61f879f8e3afa4c7944ac58a6c31948ce200911c5b27b67f1c4d1bed490532dd94ed17164fcc5784d3730fc302b70cc0f19beedaeb56bd974c0e57d747d11534c746eb2a32ac3fde3e4cdf6c3a4705762a6c6ca664b3bc89490",
      },
      {
        payload: "4d757272617920526f746862617264",
        ciphertext:
          "95ebc60d2b1fa672c1f46a8aa265ef51bfe38e7ccb39ec5be34069f144808843846a944a0652fb390d213d0700d5ae8fef7aad0ecc79a9216d15de5d7f3ee4",
      },
      {
        payload: "462e20412e20486179656b",
        ciphertext: "5d872673f64813a47a00369b15c8da92691605ad71ba019de8e718",
      },
      {
        payload: "4361726c204d656e676572",
        ciphertext: "2045266a750b6af2547f7eb1391058196b742d0aac4b3a1bcc1913",
      },
      {
        payload: "4a65616e2d426170746973746520536179",
        ciphertext: "9ec47ed0e7628c7d7a4eed631b963740ac2fd754eadaa9232e99054af4f7b29174",
      },
      {
        payload: "457567656e2042f6686d20766f6e2042617765726b",
        ciphertext: "310e359407350594cfb96eb4596e35677d4a71ceb42aa8cbba097bb9e7150b0d1bd749c4aa",
      },
    ],
    source: "cacophony.txt",
  },
];
