/**
 * VectorDBSettings 컴포넌트 테스트
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { VectorDBSettings } from '@/components/rag/VectorDBSettings';
import { VectorDBConfig, EmbeddingConfig } from '@/lib/vectordb';

// Mock fetch
global.fetch = jest.fn();

describe('VectorDBSettings', () => {
  const mockOnSave = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockClear();
  });

  describe('초기 렌더링', () => {
    it('should render with default values', () => {
      render(<VectorDBSettings onSave={mockOnSave} />);

      expect(screen.getByText('Vector Database 설정')).toBeInTheDocument();
      expect(screen.getByText('Embedding 설정')).toBeInTheDocument();

      const vectorDBType = screen.getByLabelText('Vector DB Type') as HTMLSelectElement;
      expect(vectorDBType.value).toBe('sqlite-vec');

      const indexName = screen.getByLabelText('Index Name') as HTMLInputElement;
      expect(indexName.value).toBe('documents');

      const embeddingProvider = screen.getByLabelText('Provider') as HTMLSelectElement;
      expect(embeddingProvider.value).toBe('openai');
    });

    it('should render with initial VectorDB config', () => {
      const initialVectorDBConfig: VectorDBConfig = {
        type: 'sqlite-vec',
        indexName: 'custom-index',
        dimension: 3072,
      };

      render(
        <VectorDBSettings
          onSave={mockOnSave}
          initialVectorDBConfig={initialVectorDBConfig}
        />
      );

      const indexName = screen.getByLabelText('Index Name') as HTMLInputElement;
      expect(indexName.value).toBe('custom-index');
    });

    it('should render with initial Embedding config', () => {
      const initialEmbeddingConfig: EmbeddingConfig = {
        provider: 'openai',
        model: 'text-embedding-3-large',
        dimension: 3072,
        apiKey: 'test-api-key',
        baseURL: 'https://custom-api.com/v1',
      };

      render(
        <VectorDBSettings
          onSave={mockOnSave}
          initialEmbeddingConfig={initialEmbeddingConfig}
        />
      );

      const baseURL = screen.getByLabelText('Base URL') as HTMLInputElement;
      expect(baseURL.value).toBe('https://custom-api.com/v1');

      const apiKey = screen.getByLabelText('API Key') as HTMLInputElement;
      expect(apiKey.value).toBe('test-api-key');

      const model = screen.getByLabelText('Model') as HTMLSelectElement;
      expect(model.value).toBe('text-embedding-3-large');
    });
  });

  describe('Vector DB 설정', () => {
    it('should update index name', async () => {
      const user = userEvent.setup();
      render(<VectorDBSettings onSave={mockOnSave} />);

      const indexName = screen.getByLabelText('Index Name') as HTMLInputElement;
      await user.clear(indexName);
      await user.type(indexName, 'new-index');

      expect(indexName.value).toBe('new-index');
    });

    it('should show SQLite-vec info message', () => {
      render(<VectorDBSettings onSave={mockOnSave} />);

      expect(
        screen.getByText(/SQLite-vec는 Node.js 환경\(Electron\)에서만 동작합니다/)
      ).toBeInTheDocument();
    });
  });

  describe('Embedding 설정', () => {
    it('should display default base URL', () => {
      render(<VectorDBSettings onSave={mockOnSave} />);

      const baseURL = screen.getByLabelText('Base URL') as HTMLInputElement;
      expect(baseURL.value).toBe('https://api.openai.com/v1');
    });

    it('should update API key', async () => {
      const user = userEvent.setup();
      render(<VectorDBSettings onSave={mockOnSave} />);

      const apiKey = screen.getByLabelText('API Key') as HTMLInputElement;
      await user.type(apiKey, 'sk-test-key');

      expect(apiKey.value).toBe('sk-test-key');
    });

    it('should update model and dimension', async () => {
      const user = userEvent.setup();
      render(<VectorDBSettings onSave={mockOnSave} />);

      const model = screen.getByLabelText('Model') as HTMLSelectElement;
      await user.selectOptions(model, 'text-embedding-3-large');

      expect(model.value).toBe('text-embedding-3-large');

      const dimension = screen.getByLabelText('Dimension') as HTMLInputElement;
      expect(dimension.value).toBe('3072');
    });

    it('should update dimension to 1536 for small models', async () => {
      const user = userEvent.setup();
      render(<VectorDBSettings onSave={mockOnSave} />);

      const model = screen.getByLabelText('Model') as HTMLSelectElement;
      await user.selectOptions(model, 'text-embedding-3-small');

      const dimension = screen.getByLabelText('Dimension') as HTMLInputElement;
      expect(dimension.value).toBe('1536');
    });

    it('should have disabled dimension input', () => {
      render(<VectorDBSettings onSave={mockOnSave} />);

      const dimension = screen.getByLabelText('Dimension') as HTMLInputElement;
      expect(dimension).toBeDisabled();
    });
  });

  describe('모델 목록 가져오기', () => {
    it('should show error when Base URL or API Key is missing', async () => {
      const user = userEvent.setup();
      render(<VectorDBSettings onSave={mockOnSave} />);

      // Base URL과 API Key를 지운다
      const baseURL = screen.getByLabelText('Base URL') as HTMLInputElement;
      const apiKey = screen.getByLabelText('API Key') as HTMLInputElement;
      await user.clear(baseURL);
      await user.clear(apiKey);

      const refreshButton = screen.getByTitle('사용 가능한 모델 목록 가져오기');
      await user.click(refreshButton);

      await waitFor(() => {
        expect(
          screen.getByText('Base URL과 API Key를 먼저 입력해주세요.')
        ).toBeInTheDocument();
      });
    });

    it('should fetch available models successfully', async () => {
      const user = userEvent.setup();
      const mockModels = {
        data: [
          { id: 'text-embedding-3-small' },
          { id: 'text-embedding-3-large' },
          { id: 'text-embedding-ada-002' },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockModels,
      });

      render(<VectorDBSettings onSave={mockOnSave} />);

      // API Key 입력
      const apiKey = screen.getByLabelText('API Key') as HTMLInputElement;
      await user.type(apiKey, 'sk-test-key');

      const refreshButton = screen.getByTitle('사용 가능한 모델 목록 가져오기');
      await user.click(refreshButton);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          'https://api.openai.com/v1/models',
          expect.objectContaining({
            headers: expect.objectContaining({
              Authorization: 'Bearer sk-test-key',
            }),
          })
        );
      });
    });

    it('should handle fetch error', async () => {
      const user = userEvent.setup();

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        statusText: 'Unauthorized',
      });

      render(<VectorDBSettings onSave={mockOnSave} />);

      const apiKey = screen.getByLabelText('API Key') as HTMLInputElement;
      await user.type(apiKey, 'sk-invalid-key');

      const refreshButton = screen.getByTitle('사용 가능한 모델 목록 가져오기');
      await user.click(refreshButton);

      await waitFor(() => {
        expect(
          screen.getByText(/모델 목록을 가져오는데 실패했습니다/)
        ).toBeInTheDocument();
      });
    });
  });

  describe('저장 기능', () => {
    it('should call onSave when save button clicked', async () => {
      const user = userEvent.setup();
      render(<VectorDBSettings onSave={mockOnSave} />);

      // API Key 입력 (필수)
      const apiKey = screen.getByLabelText('API Key') as HTMLInputElement;
      await user.type(apiKey, 'sk-test-key');

      const saveButton = screen.getByRole('button', { name: /저장/ });
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'sqlite-vec',
            indexName: 'documents',
            dimension: 1536,
          }),
          expect.objectContaining({
            provider: 'openai',
            apiKey: 'sk-test-key',
          })
        );
      });
    });

    it('should show error when API key is missing', async () => {
      const user = userEvent.setup();
      render(<VectorDBSettings onSave={mockOnSave} />);

      const saveButton = screen.getByRole('button', { name: /저장/ });
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText('OpenAI API 키를 입력해주세요.')).toBeInTheDocument();
      });

      expect(mockOnSave).not.toHaveBeenCalled();
    });

    it('should show success message after save', async () => {
      const user = userEvent.setup();
      render(<VectorDBSettings onSave={mockOnSave} />);

      const apiKey = screen.getByLabelText('API Key') as HTMLInputElement;
      await user.type(apiKey, 'sk-test-key');

      const saveButton = screen.getByRole('button', { name: /저장/ });
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText('VectorDB 설정이 저장되었습니다!')).toBeInTheDocument();
      });
    });

    it('should show error message when save fails', async () => {
      const user = userEvent.setup();
      const mockOnSaveError = jest.fn().mockRejectedValue(new Error('저장 실패'));

      render(<VectorDBSettings onSave={mockOnSaveError} />);

      const apiKey = screen.getByLabelText('API Key') as HTMLInputElement;
      await user.type(apiKey, 'sk-test-key');

      const saveButton = screen.getByRole('button', { name: /저장/ });
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(/저장 실패/)).toBeInTheDocument();
      });
    });

    it('should disable save button while saving', async () => {
      const user = userEvent.setup();
      const slowOnSave = jest.fn(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );

      render(<VectorDBSettings onSave={slowOnSave} />);

      const apiKey = screen.getByLabelText('API Key') as HTMLInputElement;
      await user.type(apiKey, 'sk-test-key');

      const saveButton = screen.getByRole('button', { name: /저장/ });
      await user.click(saveButton);

      expect(screen.getByRole('button', { name: /저장 중/ })).toBeDisabled();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /저장/ })).toBeEnabled();
      });
    });
  });

  describe('초기 설정 업데이트', () => {
    it('should update state when initial configs change', async () => {
      const { rerender } = render(<VectorDBSettings onSave={mockOnSave} />);

      const newVectorDBConfig: VectorDBConfig = {
        type: 'sqlite-vec',
        indexName: 'updated-index',
        dimension: 3072,
      };

      const newEmbeddingConfig: EmbeddingConfig = {
        provider: 'openai',
        model: 'text-embedding-3-large',
        dimension: 3072,
        apiKey: 'sk-new-key',
        baseURL: 'https://new-api.com/v1',
      };

      rerender(
        <VectorDBSettings
          onSave={mockOnSave}
          initialVectorDBConfig={newVectorDBConfig}
          initialEmbeddingConfig={newEmbeddingConfig}
        />
      );

      await waitFor(() => {
        const indexName = screen.getByLabelText('Index Name') as HTMLInputElement;
        expect(indexName.value).toBe('updated-index');

        const baseURL = screen.getByLabelText('Base URL') as HTMLInputElement;
        expect(baseURL.value).toBe('https://new-api.com/v1');
      });
    });
  });

  describe('사용자 입력 검증', () => {
    it('should trim whitespace from API key when saving', async () => {
      const user = userEvent.setup();
      render(<VectorDBSettings onSave={mockOnSave} />);

      const apiKey = screen.getByLabelText('API Key') as HTMLInputElement;
      await user.type(apiKey, '   '); // Only whitespace

      const saveButton = screen.getByRole('button', { name: /저장/ });
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText('OpenAI API 키를 입력해주세요.')).toBeInTheDocument();
      });
    });
  });

  describe('모델 목록 가져오기 - 다양한 API 형식', () => {
    it('should handle Ollama API format (models array)', async () => {
      const user = userEvent.setup();
      const mockModels = {
        models: [
          { name: 'nomic-embed-text' },
          { name: 'all-minilm' },
          { name: 'mxbai-embed-large' },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockModels,
      });

      render(<VectorDBSettings onSave={mockOnSave} />);

      const apiKey = screen.getByLabelText('API Key') as HTMLInputElement;
      await user.type(apiKey, 'sk-test-key');

      const refreshButton = screen.getByTitle('사용 가능한 모델 목록 가져오기');
      await user.click(refreshButton);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });
    });

    it('should handle array response format', async () => {
      const user = userEvent.setup();
      const mockModels = [
        { id: 'text-embedding-3-small' },
        { id: 'text-embedding-3-large' },
      ];

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockModels,
      });

      render(<VectorDBSettings onSave={mockOnSave} />);

      const apiKey = screen.getByLabelText('API Key') as HTMLInputElement;
      await user.type(apiKey, 'sk-test-key');

      const refreshButton = screen.getByTitle('사용 가능한 모델 목록 가져오기');
      await user.click(refreshButton);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });
    });

    it('should show error when no models found', async () => {
      const user = userEvent.setup();
      const mockModels = {
        data: [],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockModels,
      });

      render(<VectorDBSettings onSave={mockOnSave} />);

      const apiKey = screen.getByLabelText('API Key') as HTMLInputElement;
      await user.type(apiKey, 'sk-test-key');

      const refreshButton = screen.getByTitle('사용 가능한 모델 목록 가져오기');
      await user.click(refreshButton);

      await waitFor(() => {
        expect(screen.getByText('사용 가능한 모델을 찾을 수 없습니다.')).toBeInTheDocument();
      });
    });

    it('should set dimension to 3072 for large models', async () => {
      const user = userEvent.setup();
      const mockModels = {
        data: [
          { id: 'text-embedding-3-large' },
          { id: 'text-embedding-ada-002' },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockModels,
      });

      render(<VectorDBSettings onSave={mockOnSave} />);

      const apiKey = screen.getByLabelText('API Key') as HTMLInputElement;
      await user.type(apiKey, 'sk-test-key');

      const refreshButton = screen.getByTitle('사용 가능한 모델 목록 가져오기');
      await user.click(refreshButton);

      await waitFor(() => {
        const modelSelect = screen.getByLabelText('Model') as HTMLSelectElement;
        expect(modelSelect.value).toBe('text-embedding-3-large');
      });

      // Dimension should be set to 3072 for large model
      const dimensionInput = screen.getByLabelText('Dimension') as HTMLInputElement;
      expect(dimensionInput.value).toBe('3072');
    });

    it('should set dimension to 1536 for small models', async () => {
      const user = userEvent.setup();
      const mockModels = {
        data: [
          { id: 'text-embedding-3-small' },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockModels,
      });

      render(<VectorDBSettings onSave={mockOnSave} />);

      const apiKey = screen.getByLabelText('API Key') as HTMLInputElement;
      await user.type(apiKey, 'sk-test-key');

      const refreshButton = screen.getByTitle('사용 가능한 모델 목록 가져오기');
      await user.click(refreshButton);

      await waitFor(() => {
        const modelSelect = screen.getByLabelText('Model') as HTMLSelectElement;
        expect(modelSelect.value).toBe('text-embedding-3-small');
      });

      // Dimension should be set to 1536 for small model
      const dimensionInput = screen.getByLabelText('Dimension') as HTMLInputElement;
      expect(dimensionInput.value).toBe('1536');
    });

    it('should handle custom model saved in config', async () => {
      const customConfig = {
        provider: 'openai' as const,
        baseURL: 'https://api.openai.com/v1',
        apiKey: 'sk-test',
        model: 'custom-embedding-model',
        dimension: 2048,
      };

      render(<VectorDBSettings onSave={mockOnSave} initialEmbeddingConfig={customConfig} />);

      // Custom model should be in the list
      const modelSelect = screen.getByLabelText('Model') as HTMLSelectElement;
      expect(modelSelect.value).toBe('custom-embedding-model');

      // The custom model should appear as first option
      const options = Array.from(modelSelect.options).map(opt => opt.value);
      expect(options[0]).toBe('custom-embedding-model');
    });

    it('should add custom model to available models when not in list', async () => {
      const customConfig: EmbeddingConfig = {
        provider: 'openai',
        model: 'brand-new-model-2025',
        dimension: 2048,
      };

      render(<VectorDBSettings onSave={mockOnSave} initialEmbeddingConfig={customConfig} />);

      await waitFor(() => {
        const modelSelect = screen.getByLabelText('Model') as HTMLSelectElement;
        expect(modelSelect.value).toBe('brand-new-model-2025');
        const options = Array.from(modelSelect.options).map(opt => opt.value);
        expect(options).toContain('brand-new-model-2025');
      });
    });

    it('should change vectorDB type via select', async () => {
      const user = userEvent.setup();

      render(<VectorDBSettings onSave={mockOnSave} />);

      const vectorDBTypeSelect = screen.getByLabelText('Vector DB Type') as HTMLSelectElement;
      expect(vectorDBTypeSelect.value).toBe('sqlite-vec');

      await user.selectOptions(vectorDBTypeSelect, 'sqlite-vec');
      expect(vectorDBTypeSelect.value).toBe('sqlite-vec');
    });

    it('should change embedding provider via select', async () => {
      const user = userEvent.setup();

      render(<VectorDBSettings onSave={mockOnSave} />);

      const providerSelect = screen.getByLabelText('Provider') as HTMLSelectElement;
      expect(providerSelect.value).toBe('openai');

      await user.selectOptions(providerSelect, 'openai');
      expect(providerSelect.value).toBe('openai');
    });

    it('should set dimension for ada model from initial config', async () => {
      const adaConfig: EmbeddingConfig = {
        provider: 'openai',
        model: 'text-embedding-ada-002',
        dimension: 1536,
      };

      render(<VectorDBSettings onSave={mockOnSave} initialEmbeddingConfig={adaConfig} />);

      await waitFor(() => {
        const modelSelect = screen.getByLabelText('Model') as HTMLSelectElement;
        expect(modelSelect.value).toBe('text-embedding-ada-002');
      });

      const dimensionInput = screen.getByLabelText('Dimension') as HTMLInputElement;
      expect(dimensionInput.value).toBe('1536');
    });

    it('should handle small model dimension in else if branch', async () => {
      const user = userEvent.setup();

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ id: 'text-embedding-3-small' }] }),
      });

      render(<VectorDBSettings onSave={mockOnSave} />);

      await waitFor(() => {
        expect(screen.getByLabelText('Model')).toBeInTheDocument();
      });

      const modelSelect = screen.getByLabelText('Model') as HTMLSelectElement;
      await user.selectOptions(modelSelect, 'text-embedding-3-small');

      const dimensionInput = screen.getByLabelText('Dimension') as HTMLInputElement;
      await waitFor(() => {
        expect(dimensionInput.value).toBe('1536');
      });
    });

  });
});
