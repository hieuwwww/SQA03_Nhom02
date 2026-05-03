const mockDb = {
  insert: jest.fn(),
  select: jest.fn(),
  update: jest.fn()
};

const mockProcessCondition = jest.fn();
const mockProcessOrderCondition = jest.fn();
const mockWithPagination = jest.fn((q, p, ps) => q);

jest.mock('@/configs/database.config', () => ({ db: mockDb }));
jest.mock('@/utils/ApiError.helper', () => ({ __esModule: true, default: class ApiError extends Error {} }));
jest.mock('@/utils/schema.helper', () => ({
  processCondition: (...args: any[]) => mockProcessCondition(...args),
  processOrderCondition: (...args: any[]) => mockProcessOrderCondition(...args),
  withPagination: (query: any, page?: number, pageSize?: number) => mockWithPagination(query, page, pageSize)
}));

import * as service from '@/services/post.service';

const createSelectBuilder = (result: any[] = []) => ({
  from: jest.fn().mockReturnThis(),
  leftJoin: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  $dynamic: jest.fn().mockReturnThis(),
  then: (resolve: (value: any) => void) => resolve(result)
});

describe('post.service search functions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('selectRentalPostByConditions', () => {
    it('TC_TKBV_010: should return empty when no posts', async () => {
      mockDb.select.mockReturnValueOnce(createSelectBuilder([]));

      const res = await service.selectRentalPostByConditions({ status: { operator: 'eq', value: 'active' } } as any);
      expect(res).toEqual([]);
    });

    it('TC_TKBV_011: should select without location filter', async () => {
      mockDb.select
        .mockReturnValueOnce(createSelectBuilder([{ id: 100 }]))
        .mockReturnValueOnce(
          createSelectBuilder([{ post: { id: 100 }, asset: { id: 1001 }, rentalPost: { id: 2001 }, distance: null }])
        );

      const res = await service.selectRentalPostByConditions({
        status: { operator: 'eq', value: 'active' }
      } as any);
      expect(res).toHaveLength(1);
    });

    it('TC_TKBV_012: should handle db error', async () => {
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        $dynamic: jest.fn().mockReturnThis(),
        then: (resolve: any, reject: (err: any) => void) => reject(new Error('DB Error'))
      });

      await expect(service.selectRentalPostByConditions({ status: { operator: 'eq', value: 'active' } } as any)).rejects.toThrow();
    });
  });

  describe('selectRentalPostByConditions with location', () => {
    it('TC_TKBV_013: should select with location filter and asset grouping', async () => {
      mockDb.select
        .mockReturnValueOnce(createSelectBuilder([{ id: 1 }, { id: 2 }]))
        .mockReturnValueOnce(
          createSelectBuilder([
            { post: { id: 1 }, asset: { id: 11 }, rentalPost: { id: 101 }, distance: 10 },
            { post: { id: 1 }, asset: { id: 12 }, rentalPost: { id: 101 }, distance: 10 },
            { post: { id: 2 }, asset: null, rentalPost: { id: 102 }, distance: 20 }
          ])
        );

      const result = await service.selectRentalPostByConditions(
        { status: { operator: 'eq', value: 'active' }, addressLongitude: { operator: 'eq', value: 106.7 } } as any,
        { orderConditions: { createdAt: 'desc' } as any, pagination: { page: 1, pageSize: 2 } } as any
      );

      expect(result).toHaveLength(2);
    });

    it('TC_TKBV_014: should select with multiple conditions', async () => {
      mockDb.select
        .mockReturnValueOnce(createSelectBuilder([{ id: 5 }]))
        .mockReturnValueOnce(createSelectBuilder([{ post: { id: 5 }, asset: { id: 51 }, rentalPost: { id: 501 } }]));

      const result = await service.selectRentalPostByConditions(
        { status: { operator: 'eq', value: 'active' }, price: { operator: 'gt', value: 1000000 } } as any
      );

      expect(result).toHaveLength(1);
    });
  });

  describe('selectWantedPostByConditions', () => {
    it('TC_TKBV_015: should return empty when no posts', async () => {
      mockDb.select.mockReturnValueOnce(createSelectBuilder([]));

      const res = await service.selectWantedPostByConditions({ status: { operator: 'eq', value: 'active' } } as any);
      expect(res).toEqual([]);
    });

    it('TC_TKBV_016: should select with location filter', async () => {
      mockDb.select
        .mockReturnValueOnce(createSelectBuilder([{ id: 6 }]))
        .mockReturnValueOnce(
          createSelectBuilder([{ post: { id: 6 }, asset: { id: 61 }, wantedPost: { id: 601 }, distance: 5 }])
        );

      const result = await service.selectWantedPostByConditions(
        { status: { operator: 'eq', value: 'active' }, addressLongitude: { operator: 'eq', value: 106.5 } } as any
      );

      expect(result).toHaveLength(1);
    });
  });

  describe('selectJoinPostByConditions', () => {
    it('TC_TKBV_017: should select with location filter', async () => {
      mockDb.select
        .mockReturnValueOnce(createSelectBuilder([{ id: 3 }]))
        .mockReturnValueOnce(
          createSelectBuilder([
            { post: { id: 3 }, asset: { id: 31 }, joinPost: { id: 201 }, distance: 12 },
            { post: { id: 3 }, asset: { id: 32 }, joinPost: { id: 201 }, distance: 12 }
          ])
        );

      const result = await service.selectJoinPostByConditions(
        { status: { operator: 'eq', value: 'active' }, addressLongitude: { operator: 'eq', value: 106.7 } } as any,
        { pagination: { page: 1, pageSize: 10 } } as any
      );

      expect(result).toHaveLength(1);
      expect(result[0].assets).toHaveLength(2);
    });

    it('TC_TKBV_018: should return empty when no results', async () => {
      mockDb.select.mockReturnValueOnce(createSelectBuilder([]));

      const result = await service.selectJoinPostByConditions({ status: { operator: 'eq', value: 'inactive' } } as any);
      expect(result).toEqual([]);
    });
  });

  describe('selectPassPostByConditions', () => {
    it('TC_TKBV_019: should select and deduplicate assets', async () => {
      mockDb.select
        .mockReturnValueOnce(createSelectBuilder([{ id: 4 }]))
        .mockReturnValueOnce(
          createSelectBuilder([
            { post: { id: 4 }, asset: { id: 41 }, passPost: { id: 301 }, passItem: { id: 401 }, distance: 15 },
            { post: { id: 4 }, asset: { id: 41 }, passPost: { id: 301 }, passItem: { id: 401 }, distance: 15 },
            { post: { id: 4 }, asset: { id: 42 }, passPost: { id: 301 }, passItem: { id: 402 }, distance: 15 }
          ])
        );

      const result = await service.selectPassPostByConditions(
        { status: { operator: 'eq', value: 'active' }, addressLongitude: { operator: 'eq', value: 106.7 } } as any,
        { orderConditions: { createdAt: 'desc' } as any } as any
      );

      expect(result).toHaveLength(1);
      expect(result[0].assets).toHaveLength(2);
      expect(result[0].passItems).toHaveLength(2);
    });

    it('TC_TKBV_020: should return empty when no results', async () => {
      mockDb.select.mockReturnValueOnce(createSelectBuilder([]));

      const result = await service.selectPassPostByConditions({ status: { operator: 'eq', value: 'expired' } } as any);
      expect(result).toEqual([]);
    });

    it('TC_TKBV_021: should select with multiple conditions', async () => {
      mockDb.select
        .mockReturnValueOnce(createSelectBuilder([{ id: 8 }]))
        .mockReturnValueOnce(
          createSelectBuilder([{ post: { id: 8 }, asset: { id: 81 }, passPost: { id: 801 }, passItem: { id: 881 } }])
        );

      const result = await service.selectPassPostByConditions(
        { status: { operator: 'eq', value: 'active' }, numberOfParticipants: { operator: 'gt', value: 2 } } as any
      );

      expect(result).toHaveLength(1);
    });
  });

  describe('selectInterestedUserPostByConditions', () => {
    it('TC_TKBV_022: should select with conditions and order', async () => {
      mockDb.select.mockReturnValueOnce(createSelectBuilder([{ id: 5, userId: 7 }]));

      const res = await service.selectInterestedUserPostByConditions(
        { userId: { operator: 'eq', value: 7 } } as any,
        { orderConditions: { createdAt: 'desc' } as any } as any
      );

      expect(res).toEqual([{ id: 5, userId: 7 }]);
      expect(mockProcessCondition).toHaveBeenCalled();
      expect(mockProcessOrderCondition).toHaveBeenCalled();
    });

    it('TC_TKBV_023: should return empty when no results', async () => {
      mockDb.select.mockReturnValueOnce(createSelectBuilder([]));

      const result = await service.selectInterestedUserPostByConditions(
        { userId: { operator: 'eq', value: 999 } } as any
      );

      expect(result).toEqual([]);
    });

    it('TC_TKBV_024: should select with multiple conditions', async () => {
      mockDb.select.mockReturnValueOnce(createSelectBuilder([{ id: 10, postId: 101, userId: 8 }]));

      await service.selectInterestedUserPostByConditions(
        { userId: { operator: 'eq', value: 8 }, postId: { operator: 'eq', value: 101 } } as any
      );

      expect(mockProcessCondition).toHaveBeenCalledTimes(2);
    });
  });
});
