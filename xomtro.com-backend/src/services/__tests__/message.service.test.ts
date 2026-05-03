const mockDb = {
  insert: jest.fn(),
  select: jest.fn(),
  update: jest.fn()
};

const mockProcessCondition = jest.fn();
const mockProcessOrderCondition = jest.fn();
const mockWithPagination = jest.fn((q, p, ps) => q);

jest.mock('@/configs/database.config', () => ({ db: mockDb }));
jest.mock('@/utils/schema.helper', () => ({
  processCondition: (...args: any[]) => mockProcessCondition(...args),
  processOrderCondition: (...args: any[]) => mockProcessOrderCondition(...args),
  withPagination: (query: any, page?: number, pageSize?: number) => mockWithPagination(query, page, pageSize)
}));

import * as service from '@/services/message.service';

const createSelectBuilder = (result: any[] = []) => ({
  from: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  $dynamic: jest.fn().mockReturnThis(),
  then: (resolve: (value: any) => void) => resolve(result)
});

const createInsertBuilder = (result: any[]) => ({
  values: jest.fn().mockReturnThis(),
  $returningId: jest.fn(() => Promise.resolve(result))
});

const createUpdateBuilder = (result: any[]) => ({
  set: jest.fn().mockReturnThis(),
  where: jest.fn(() => Promise.resolve(result))
});

describe('message.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('insertMessage', () => {
    it('TC_NT_052: should insert message', async () => {
      mockDb.insert.mockReturnValueOnce(createInsertBuilder([{ id: 1 }]));

      const res = await service.insertMessage({} as any);
      expect(res).toEqual([{ id: 1 }]);
    });

    it('TC_NT_053: should handle db error', async () => {
      mockDb.insert.mockReturnValueOnce({
        values: jest.fn().mockReturnThis(),
        $returningId: jest.fn(() => Promise.reject(new Error('DB Error')))
      });

      await expect(service.insertMessage({} as any)).rejects.toThrow();
    });
  });

  describe('selectMessageByConditions', () => {
    it('TC_NT_054: should select with limit', async () => {
      mockDb.select.mockReturnValueOnce(createSelectBuilder([{ id: 2 }]));

      const res = await service.selectMessageByConditions({ chatId: { operator: 'eq', value: 10 } } as any, 5);
      expect(res).toEqual([{ id: 2 }]);
      expect(mockProcessCondition).toHaveBeenCalled();
    });

    it('TC_NT_055: should return empty when no match', async () => {
      mockDb.select.mockReturnValueOnce(createSelectBuilder([]));

      const res = await service.selectMessageByConditions({ chatId: { operator: 'eq', value: 999 } } as any, 5);
      expect(res).toEqual([]);
    });

    it('TC_NT_056: should handle limit=0', async () => {
      mockDb.select.mockReturnValueOnce(createSelectBuilder([]));

      const res = await service.selectMessageByConditions({ chatId: { operator: 'eq', value: 10 } } as any, 0);
      expect(res).toEqual([]);
    });
  });

  describe('selectMessageByConditions without limit', () => {
    it('TC_NT_057: should select without limit', async () => {
      mockDb.select.mockReturnValueOnce(createSelectBuilder([{ id: 3 }]));

      const res = await service.selectMessageByConditions({} as any);
      expect(res).toEqual([{ id: 3 }]);
    });

    it('TC_NT_058: should select with multiple conditions', async () => {
      mockDb.select.mockReturnValueOnce(createSelectBuilder([{ id: 30 }]));

      await service.selectMessageByConditions({
        chatId: { operator: 'eq', value: 10 },
        isRecalled: { operator: 'eq', value: false }
      } as any);
      expect(mockProcessCondition).toHaveBeenCalledTimes(2);
    });
  });

  describe('selectMessagesOfChatId', () => {
    it('TC_NT_059: should select with order and pagination', async () => {
      mockDb.select.mockReturnValueOnce(createSelectBuilder([{ id: 4 }]));

      const res = await service.selectMessagesOfChatId(10, {
        orderConditions: { sentAt: 'desc' } as any,
        pagination: { page: 2, pageSize: 5 }
      } as any);
      expect(res).toEqual([{ id: 4 }]);
      expect(mockProcessOrderCondition).toHaveBeenCalled();
    });

    it('TC_NT_060: should return empty when no messages', async () => {
      mockDb.select.mockReturnValueOnce(createSelectBuilder([]));

      const res = await service.selectMessagesOfChatId(999);
      expect(res).toEqual([]);
    });

    it('TC_NT_061: should handle invalid chatId', async () => {
      mockDb.select.mockReturnValueOnce(createSelectBuilder([]));

      const res = await service.selectMessagesOfChatId(-1);
      expect(res).toEqual([]);
    });
  });

  describe('selectMessagesOfChatId with defaults', () => {
    it('TC_NT_062: should select with default pagination', async () => {
      mockDb.select.mockReturnValueOnce(createSelectBuilder([{ id: 5 }]));

      const res = await service.selectMessagesOfChatId(20);
      expect(res).toEqual([{ id: 5 }]);
      expect(mockWithPagination).toHaveBeenCalledWith(expect.any(Object), 1, 15);
    });

    it('TC_NT_063: should select with custom pagination', async () => {
      mockDb.select.mockReturnValueOnce(createSelectBuilder([{ id: 50 }]));

      const res = await service.selectMessagesOfChatId(20, {
        pagination: { page: 3, pageSize: 20 }
      } as any);
      expect(res).toEqual([{ id: 50 }]);
      expect(mockWithPagination).toHaveBeenCalledWith(expect.any(Object), 3, 20);
    });
  });

  describe('updateMessageByConditions', () => {
    it('TC_NT_064: should update messages', async () => {
      mockDb.update.mockReturnValueOnce(createUpdateBuilder([{ id: 6 }]));

      const res = await service.updateMessageByConditions(
        { isRecalled: true } as any,
        { id: { operator: 'eq', value: 6 } } as any
      );
      expect(res).toEqual([{ id: 6 }]);
    });

    it('TC_NT_065: should return empty when no match', async () => {
      mockDb.update.mockReturnValueOnce(createUpdateBuilder([]));

      const res = await service.updateMessageByConditions(
        { isRecalled: true } as any,
        { id: { operator: 'eq', value: 999 } } as any
      );
      expect(res).toEqual([]);
    });

    it('TC_NT_066: should update with multiple conditions', async () => {
      mockDb.update.mockReturnValueOnce(createUpdateBuilder([{ id: 60 }]));

      await service.updateMessageByConditions(
        { isRecalled: true } as any,
        { chatId: { operator: 'eq', value: 10 }, senderId: { operator: 'eq', value: 5 } } as any
      );
      expect(mockProcessCondition).toHaveBeenCalledTimes(2);
    });
  });
});
