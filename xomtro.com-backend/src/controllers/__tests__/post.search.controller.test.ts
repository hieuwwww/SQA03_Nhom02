import { NextFunction, Request, Response } from 'express';

jest.mock('@/services/post.service');
jest.mock('@/services/location.service');
jest.mock('@/services/fileUpload.service');
jest.mock('@/services/comment.service');
jest.mock('@/services/notification.service');
jest.mock('@/services/asset.service');
jest.mock('@/configs/socket.config', () => ({
  getSocketIdByUserId: jest.fn(),
  io: { to: jest.fn().mockImplementation(() => ({ emit: jest.fn() })) }
}));

import * as controller from '@/controllers/post.controller';
import * as postService from '@/services/post.service';

describe('post.controller search handlers (unit)', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { params: {}, body: {}, query: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    } as any;
    next = jest.fn();
  });

  // test_case_id: TC_TKBV_001
  // test_objective: Kiem tra xu ly khi thieu whereConditions/orderConditions trong searchPosts
  it('should call next when whereConditions/orderConditions missing in searchPosts', async () => {
    req.params = { type: 'rental' } as any;
    req.body = {} as any;

    await controller.searchPosts(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
  });

  // test_case_id: TC_TKBV_002
  // test_objective: Kiem tra xu ly khi type khong hop le trong searchPosts
  it('should call next when type is invalid in searchPosts', async () => {
    req.params = { type: 'invalid' } as any;
    req.body = { whereConditions: {}, orderConditions: {} } as any;

    await controller.searchPosts(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
  });

  // test_case_id: TC_TKBV_003
  // test_objective: Kiem tra tim kiem bai viet cho thue thanh cong trong searchPosts
  it('should search rental posts successfully in searchPosts', async () => {
    req.params = { type: 'rental' } as any;
    req.body = {
      whereConditions: {},
      orderConditions: {},
      pagination: { page: 1, pageSize: 2 }
    } as any;

    (postService.selectRentalPostByConditions as jest.Mock)
      .mockResolvedValueOnce([{ id: 1 }, { id: 2 }, { id: 3 }])
      .mockResolvedValueOnce([{ id: 1 }, { id: 2 }]);

    await controller.searchPosts(req as Request, res as Response, next);

    expect(postService.selectRentalPostByConditions).toHaveBeenCalledTimes(2);
    expect(res.status).toHaveBeenCalledWith(200);
    const payload = (res.json as jest.Mock).mock.calls[0][0];
    expect(payload).toHaveProperty('data');
    expect(payload.data).toHaveProperty('results');
    expect(payload.data).toHaveProperty('pagination');
  });

  // test_case_id: TC_TKBV_004
  // test_objective: Kiem tra xu ly khi nearest thieu latitude/longitude trong searchPosts
  it('should call next when nearest missing latitude/longitude in searchPosts', async () => {
    req.params = { type: 'rental' } as any;
    req.body = {
      whereConditions: { nearest: { radius: 5 } },
      orderConditions: {}
    } as any;

    await controller.searchPosts(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
  });

  // test_case_id: TC_TKBV_005
  // test_objective: Kiem tra chuan hoa khoang totalArea khi totalAreaStart > totalAreaEnd
  it('should normalize totalArea range when totalAreaStart > totalAreaEnd in searchPosts', async () => {
    req.params = { type: 'rental' } as any;
    req.body = {
      whereConditions: { totalAreaStart: 40, totalAreaEnd: 20 },
      orderConditions: {},
      pagination: { page: 1, pageSize: 10 }
    } as any;

    (postService.selectRentalPostByConditions as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await controller.searchPosts(req as Request, res as Response, next);

    const whereArg = (postService.selectRentalPostByConditions as jest.Mock).mock.calls[0][0];
    expect(whereArg.totalArea.value).toEqual([20, 40]);
  });

  // test_case_id: TC_TKBV_006
  // test_objective: Kiem tra xu ly khi dateStart khong hop le trong searchPosts
  it('should call next when dateStart is invalid in searchPosts', async () => {
    req.params = { type: 'rental' } as any;
    req.body = {
      whereConditions: { dateStart: 'ngay-khong-hop-le' },
      orderConditions: {}
    } as any;

    await controller.searchPosts(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
  });

  // test_case_id: TC_TKBV_007
  // test_objective: Kiem tra tim kiem bai viet tim nguoi thanh cong trong searchPosts
  it('should search wanted posts successfully in searchPosts', async () => {
    req.params = { type: 'wanted' } as any;
    req.body = {
      whereConditions: {},
      orderConditions: {}
    } as any;

    (postService.selectWantedPostByConditions as jest.Mock)
      .mockResolvedValueOnce([{ id: 1 }, { id: 2 }])
      .mockResolvedValueOnce([{ id: 1 }]);

    await controller.searchPosts(req as Request, res as Response, next);

    expect(postService.selectWantedPostByConditions).toHaveBeenCalledTimes(2);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  // test_case_id: TC_TKBV_008
  // test_objective: Kiem tra tim kiem bai viet tham gia thanh cong trong searchPosts
  it('should search join posts successfully in searchPosts', async () => {
    req.params = { type: 'join' } as any;
    req.body = {
      whereConditions: {},
      orderConditions: {}
    } as any;

    (postService.selectJoinPostByConditions as jest.Mock)
      .mockResolvedValueOnce([{ id: 1 }, { id: 2 }])
      .mockResolvedValueOnce([{ id: 1 }]);

    await controller.searchPosts(req as Request, res as Response, next);

    expect(postService.selectJoinPostByConditions).toHaveBeenCalledTimes(2);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  // test_case_id: TC_TKBV_009
  // test_objective: Kiem tra xu ly khi page va pageSize bang 0 trong searchPosts
  it('should handle page and pageSize zero in searchPosts', async () => {
    req.params = { type: 'rental' } as any;
    req.body = {
      whereConditions: {},
      orderConditions: {},
      pagination: { page: 0, pageSize: 0 }
    } as any;

    (postService.selectRentalPostByConditions as jest.Mock)
      .mockResolvedValueOnce([{ id: 1 }, { id: 2 }])
      .mockResolvedValueOnce([{ id: 1 }]);

    await controller.searchPosts(req as Request, res as Response, next);

    expect(postService.selectRentalPostByConditions).toHaveBeenCalledTimes(2);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  // test_case_id: TC_TKBV_010
  // test_objective: Kiem tra xu ly khi thieu whereConditions/orderConditions trong searchPassPosts
  it('should call next when whereConditions/orderConditions missing in searchPassPosts', async () => {
    req.body = {} as any;

    await controller.searchPassPosts(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
  });

  // test_case_id: TC_TKBV_011
  // test_objective: Kiem tra xu ly khi passItemStatus khong hop le trong searchPassPosts
  it('should call next when passItemStatus invalid in searchPassPosts', async () => {
    req.body = {
      whereConditions: { passItemStatus: 'broken' },
      orderConditions: {}
    } as any;

    await controller.searchPassPosts(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
  });

  // test_case_id: TC_TKBV_012
  // test_objective: Kiem tra tim kiem bai viet pass thanh cong trong searchPassPosts
  it('should search pass posts successfully in searchPassPosts', async () => {
    req.body = {
      whereConditions: {},
      orderConditions: {},
      pagination: { page: 2, pageSize: 3 }
    } as any;

    (postService.selectPassPostByConditions as jest.Mock)
      .mockResolvedValueOnce([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }])
      .mockResolvedValueOnce([{ id: 4 }]);

    await controller.searchPassPosts(req as Request, res as Response, next);

    expect(postService.selectPassPostByConditions).toHaveBeenCalledTimes(2);
    expect(res.status).toHaveBeenCalledWith(200);
    const payload = (res.json as jest.Mock).mock.calls[0][0];
    expect(payload).toHaveProperty('data');
    expect(payload.data).toHaveProperty('results');
    expect(payload.data).toHaveProperty('pagination');
  });

  // test_case_id: TC_TKBV_013
  // test_objective: Kiem tra xu ly khi status khong hop le trong searchPassPosts
  it('should call next when status invalid in searchPassPosts', async () => {
    req.body = {
      whereConditions: { status: 'closed' },
      orderConditions: {}
    } as any;

    await controller.searchPassPosts(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
  });

  // test_case_id: TC_TKBV_014
  // test_objective: Kiem tra xu ly khi nearest thieu latitude/longitude trong searchPassPosts
  it('should call next when nearest missing latitude/longitude in searchPassPosts', async () => {
    req.body = {
      whereConditions: { nearest: { longitude: 106.7 } },
      orderConditions: {}
    } as any;

    await controller.searchPassPosts(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
  });

  // test_case_id: TC_TKBV_015
  // test_objective: Kiem tra xu ly khi currentUser null trong searchPassPosts
  it('should call next when currentUser is null in searchPassPosts', async () => {
    req.currentUser = null as any;
    req.body = {
      whereConditions: {},
      orderConditions: {}
    } as any;

    await controller.searchPassPosts(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
  });

  // test_case_id: TC_TKBV_016
  // test_objective: Kiem tra xu ly khi dateStart khong hop le trong searchPassPosts
  it('should call next when dateStart is invalid in searchPassPosts', async () => {
    req.body = {
      whereConditions: { dateStart: 'invalid-date' },
      orderConditions: {}
    } as any;

    await controller.searchPassPosts(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
  });
});
