import { RAGEngine } from './ragEngine'

jest.mock('./embedding', () => ({
  getEmbeddingModelClient: jest.fn(() => ({
    id: 'test-embedding',
    dimension: 3,
    getEmbedding: jest.fn(async () => [0.1, 0.2, 0.3]),
  })),
}))

describe('RAGEngine', () => {
  test('processQuery searches existing vectors without updating the vault index first', async () => {
    const vectorManager = {
      updateVaultIndex: jest.fn(),
      performSimilaritySearch: jest.fn(async () => []),
    }

    const engine = new RAGEngine(
      {} as never,
      {
        embeddingModelId: 'test-embedding',
        ragOptions: {
          chunkSize: 1000,
          excludePatterns: [],
          includePatterns: [],
          limit: 10,
          minSimilarity: 0,
          thresholdTokens: 8192,
        },
      } as never,
      vectorManager as never,
    )

    await engine.processQuery({ query: 'what changed?' })

    expect(vectorManager.updateVaultIndex).not.toHaveBeenCalled()
    expect(vectorManager.performSimilaritySearch).toHaveBeenCalledWith(
      [0.1, 0.2, 0.3],
      expect.objectContaining({
        id: 'test-embedding',
        dimension: 3,
      }),
      {
        limit: 10,
        minSimilarity: 0,
        scope: undefined,
      },
    )
  })

  test('updateFilesIndex delegates only the requested file paths', async () => {
    const vectorManager = {
      updateVaultIndex: jest.fn(async () => undefined),
      performSimilaritySearch: jest.fn(async () => []),
    }

    const engine = new RAGEngine(
      {} as never,
      {
        embeddingModelId: 'test-embedding',
        ragOptions: {
          chunkSize: 1000,
          excludePatterns: ['archive/**'],
          includePatterns: ['notes/**'],
          limit: 10,
          minSimilarity: 0,
          thresholdTokens: 8192,
        },
      } as never,
      vectorManager as never,
    )

    await engine.updateFilesIndex(['notes/a.md'])

    expect(vectorManager.updateVaultIndex).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'test-embedding',
        dimension: 3,
      }),
      {
        chunkSize: 1000,
        excludePatterns: ['archive/**'],
        filePaths: ['notes/a.md'],
        includePatterns: ['notes/**'],
        reindexAll: false,
      },
      expect.any(Function),
    )
  })
})
