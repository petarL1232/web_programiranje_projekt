const { loadValidatedBlockchain } = require('../utils/chainValidation');

let socketServer = null;

const setSocketServer = (io) => {
  socketServer = io;
};

const getSocketServer = () => socketServer;

const loadPublicBlockchainPayload = async () => {
  const { summary, blocks } = await loadValidatedBlockchain({
    includeDocuments: true,
    requestUser: null,
  });

  return { summary, blocks };
};

const broadcastBlockCreated = async ({ blockId }) => {
  if (!socketServer) {
    return;
  }

  const { summary, blocks } = await loadPublicBlockchainPayload();
  const blockIdText = blockId ? blockId.toString() : null;
  const block = blockIdText
    ? blocks.find((item) => item.id === blockIdText)
    : blocks.at(-1) || null;

  socketServer.emit('blockchain:block-created', {
    event: 'blockchain:block-created',
    message: block ? `New blockchain block #${block.index} created` : 'Blockchain block created',
    block,
    summary,
    timestamp: new Date().toISOString(),
  });
};

const broadcastChainChanged = async (message = 'Blockchain data changed') => {
  if (!socketServer) {
    return;
  }

  const { summary, blocks } = await loadPublicBlockchainPayload();

  socketServer.emit('blockchain:chain-updated', {
    event: 'blockchain:chain-updated',
    message,
    summary,
    blocks,
    timestamp: new Date().toISOString(),
  });
};

module.exports = {
  broadcastBlockCreated,
  broadcastChainChanged,
  getSocketServer,
  setSocketServer,
};
