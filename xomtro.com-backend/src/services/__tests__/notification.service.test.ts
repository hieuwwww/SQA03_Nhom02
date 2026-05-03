const mockDb = {
  insert: jest.fn(),
  select: jest.fn(),
  update: jest.fn(),
  delete: jest.fn()
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

import * as service from '@/services/notification.service';

const createSelectBuilder = (result: any[] = []) => ({
  from: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
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

const createDeleteBuilder = (result: any[]) => ({
  where: jest.fn(() => Promise.resolve(result))
});

describe('notification.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('insertNotification', () => {
    it('TC_QLTB_019: should insert notification successfully', async () => {
      const result = [{ id: 1 }];
      mockDb.insert.mockReturnValueOnce(createInsertBuilder(result));

      const res = await service.insertNotification({ type: 'post' } as any);
      expect(res).toEqual(result);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('TC_QLTB_020: should handle insert with empty payload', async () => {
      const result = [{ id: 2 }];
      mockDb.insert.mockReturnValueOnce(createInsertBuilder(result));

      const res = await service.insertNotification({} as any);
      expect(res).toEqual(result);
    });

    it('TC_QLTB_021: should handle db error on insert', async () => {
      mockDb.insert.mockReturnValueOnce({
        values: jest.fn().mockReturnThis(),
        $returningId: jest.fn(() => Promise.reject(new Error('DB Error')))
      });

      await expect(service.insertNotification({} as any)).rejects.toThrow('DB Error');
    });
  });

  describe('selectNotificationByConditions', () => {
    it('TC_QLTB_022: should select with conditions, order and pagination', async () => {
      const result = [{ id: 1 }];
      mockDb.select.mockReturnValueOnce(createSelectBuilder(result));

      const res = await service.selectNotificationByConditions(
        { type: { operator: 'eq', value: 'post' } } as any,
        { orderConditions: { createdAt: 'desc' } as any, pagination: { page: 2, pageSize: 5 } } as any
      );
      expect(res).toEqual(result);
      expect(mockProcessCondition).toHaveBeenCalled();
    });

    it('TC_QLTB_023: should select without filters', async () => {
      const result = [{ id: 2 }];
      mockDb.select.mockReturnValueOnce(createSelectBuilder(result));

      const res = await service.selectNotificationByConditions({} as any);
      expect(res).toEqual(result);
    });

    it('TC_QLTB_024: should select with multiple conditions', async () => {
      mockDb.select.mockReturnValueOnce(createSelectBuilder([]));

      await service.selectNotificationByConditions(
        { type: { operator: 'eq', value: 'post' }, isRead: { operator: 'eq', value: false } } as any
      );
      expect(mockProcessCondition).toHaveBeenCalledTimes(2);
    });

    it('TC_QLTB_025: should return empty when no results', async () => {
      mockDb.select.mockReturnValueOnce(createSelectBuilder([]));

      const res = await service.selectNotificationByConditions({ type: { operator: 'eq', value: 'unknown' } } as any);
      expect(res).toEqual([]);
    });
  });

  describe('updateNotificationByConditions', () => {
    it('TC_QLTB_026: should update notification', async () => {
      const result = [{ id: 3 }];
      mockDb.update.mockReturnValueOnce(createUpdateBuilder(result));

      const res = await service.updateNotificationByConditions(
        { isRead: true } as any,
        { id: { operator: 'eq', value: 3 } } as any
      );
      expect(res).toEqual(result);
    });

    it('TC_QLTB_027: should return empty when no match', async () => {
      mockDb.update.mockReturnValueOnce(createUpdateBuilder([]));

      const res = await service.updateNotificationByConditions(
        { isRead: true } as any,
        { id: { operator: 'eq', value: 999 } } as any
      );
      expect(res).toEqual([]);
    });

    it('TC_QLTB_028: should update with multiple conditions', async () => {
      mockDb.update.mockReturnValueOnce(createUpdateBuilder([{ id: 30 }]));

      await service.updateNotificationByConditions(
        { isRead: true } as any,
        { type: { operator: 'eq', value: 'post' }, recipientId: { operator: 'eq', value: 5 } } as any
      );
      expect(mockProcessCondition).toHaveBeenCalledTimes(2);
    });
  });

  describe('deleteNotificationByConditions', () => {
    it('TC_QLTB_029: should delete notification', async () => {
      const result = [{ id: 4 }];
      mockDb.delete.mockReturnValueOnce(createDeleteBuilder(result));

      const res = await service.deleteNotificationByConditions({ id: { operator: 'eq', value: 4 } } as any);
      expect(res).toEqual(result);
    });

    it('TC_QLTB_030: should return empty when no match', async () => {
      mockDb.delete.mockReturnValueOnce(createDeleteBuilder([]));

      const res = await service.deleteNotificationByConditions({ id: { operator: 'eq', value: 999 } } as any);
      expect(res).toEqual([]);
    });

    it('TC_QLTB_031: should delete with multiple conditions', async () => {
      mockDb.delete.mockReturnValueOnce(createDeleteBuilder([{ id: 40 }]));

      await service.deleteNotificationByConditions(
        { type: { operator: 'eq', value: 'post' }, isRead: { operator: 'eq', value: true } } as any
      );
      expect(mockProcessCondition).toHaveBeenCalledTimes(2);
    });
  });
});
