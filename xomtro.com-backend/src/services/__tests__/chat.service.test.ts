const mockDb = {
  insert: jest.fn(),
  select: jest.fn(),
  update: jest.fn()
};

const mockProcessCondition = jest.fn();

jest.mock('@/configs/database.config', () => ({ db: mockDb }));
jest.mock('@/utils/schema.helper', () => ({
  processCondition: (...args: any[]) => mockProcessCondition(...args)
}));

import * as service from '@/services/chat.service';

const createSelectBuilder = (result: any[] = []) => ({
  from: jest.fn().mockReturnThis(),
  leftJoin: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
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

describe('chat.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('insertChat', () => {
    it('TC_NT_033: should insert chat', async () => {
      mockDb.insert.mockReturnValueOnce(createInsertBuilder([{ id: 1 }]));

      const res = await service.insertChat({} as any);
      expect(res).toEqual([{ id: 1 }]);
    });

    it('TC_NT_034: should handle db error', async () => {
      mockDb.insert.mockReturnValueOnce({
        values: jest.fn().mockReturnThis(),
        $returningId: jest.fn(() => Promise.reject(new Error('DB Error')))
      });

      await expect(service.insertChat({} as any)).rejects.toThrow();
    });
  });

  describe('insertChatMembers', () => {
    it('TC_NT_035: should insert chat members', async () => {
      mockDb.insert.mockReturnValueOnce(createInsertBuilder([{ id: 2 }]));

      const res = await service.insertChatMembers([{}] as any);
      expect(res).toEqual([{ id: 2 }]);
    });

    it('TC_NT_036: should handle empty array', async () => {
      mockDb.insert.mockReturnValueOnce(createInsertBuilder([]));

      const res = await service.insertChatMembers([] as any);
      expect(res).toEqual([]);
    });
  });

  describe('selectChatById', () => {
    it('TC_NT_037: should select chat by id', async () => {
      mockDb.select.mockReturnValueOnce(createSelectBuilder([{ id: 10 }]));

      const res = await service.selectChatById(10);
      expect(res).toEqual([{ id: 10 }]);
    });

    it('TC_NT_038: should return empty when not found', async () => {
      mockDb.select.mockReturnValueOnce(createSelectBuilder([]));

      const res = await service.selectChatById(999);
      expect(res).toEqual([]);
    });

    it('TC_NT_039: should handle invalid id', async () => {
      mockDb.select.mockReturnValueOnce(createSelectBuilder([]));

      const res = await service.selectChatById(-1);
      expect(res).toEqual([]);
    });
  });

  describe('selectChatIdBetweenTwoUserId', () => {
    it('TC_NT_040: should select chat between two users', async () => {
      mockDb.select.mockReturnValueOnce(createSelectBuilder([{ id: 20 }]));

      const res = await service.selectChatIdBetweenTwoUserId(1, 2);
      expect(res).toEqual([{ id: 20 }]);
    });

    it('TC_NT_041: should return empty when no chat exists', async () => {
      mockDb.select.mockReturnValueOnce(createSelectBuilder([]));

      const res = await service.selectChatIdBetweenTwoUserId(1, 999);
      expect(res).toEqual([]);
    });

    it('TC_NT_042: should handle invalid ids', async () => {
      mockDb.select.mockReturnValueOnce(createSelectBuilder([]));

      const res = await service.selectChatIdBetweenTwoUserId(-1, -2);
      expect(res).toEqual([]);
    });
  });

  describe('selectChatMemberByConditions', () => {
    it('TC_NT_043: should select by conditions', async () => {
      mockDb.select.mockReturnValueOnce(createSelectBuilder([{ chatId: 30 }]));

      const res = await service.selectChatMemberByConditions({ userId: { operator: 'eq', value: 1 } } as any);
      expect(res).toEqual([{ chatId: 30 }]);
      expect(mockProcessCondition).toHaveBeenCalled();
    });

    it('TC_NT_044: should select with multiple conditions', async () => {
      mockDb.select.mockReturnValueOnce(createSelectBuilder([{ chatId: 31 }]));

      await service.selectChatMemberByConditions(
        { chatId: { operator: 'eq', value: 1 }, userId: { operator: 'eq', value: 2 } } as any
      );
      expect(mockProcessCondition).toHaveBeenCalledTimes(2);
    });

    it('TC_NT_045: should return empty when no match', async () => {
      mockDb.select.mockReturnValueOnce(createSelectBuilder([]));

      const res = await service.selectChatMemberByConditions({ userId: { operator: 'eq', value: 999 } } as any);
      expect(res).toEqual([]);
    });
  });

  describe('selectIndividualChatsByUserId', () => {
    it('TC_NT_046: should select individual chats', async () => {
      mockDb.select.mockReturnValueOnce(createSelectBuilder([{ chatId: 40 }]));

      const res = await service.selectIndividualChatsByUserId(5);
      expect(res).toEqual([{ chatId: 40 }]);
    });

    it('TC_NT_047: should return empty when no chats', async () => {
      mockDb.select.mockReturnValueOnce(createSelectBuilder([]));

      const res = await service.selectIndividualChatsByUserId(999);
      expect(res).toEqual([]);
    });

    it('TC_NT_048: should handle invalid user id', async () => {
      mockDb.select.mockReturnValueOnce(createSelectBuilder([]));

      const res = await service.selectIndividualChatsByUserId(-1);
      expect(res).toEqual([]);
    });
  });

  describe('updateChatMemberByConditions', () => {
    it('TC_NT_049: should update chat members', async () => {
      mockDb.update.mockReturnValueOnce(createUpdateBuilder([{ id: 50 }]));

      const res = await service.updateChatMemberByConditions(
        { lastRead: new Date() } as any,
        { chatId: { operator: 'eq', value: 1 } } as any
      );
      expect(res).toEqual([{ id: 50 }]);
    });

    it('TC_NT_050: should return empty when no match', async () => {
      mockDb.update.mockReturnValueOnce(createUpdateBuilder([]));

      const res = await service.updateChatMemberByConditions(
        { lastRead: new Date() } as any,
        { chatId: { operator: 'eq', value: 999 } } as any
      );
      expect(res).toEqual([]);
    });

    it('TC_NT_051: should update with multiple conditions', async () => {
      mockDb.update.mockReturnValueOnce(createUpdateBuilder([{ id: 51 }]));

      await service.updateChatMemberByConditions(
        { lastRead: new Date() } as any,
        { chatId: { operator: 'eq', value: 1 }, userId: { operator: 'eq', value: 5 } } as any
      );
      expect(mockProcessCondition).toHaveBeenCalledTimes(2);
    });
  });
});
