import { NextFunction, Request, Response } from 'express';

jest.mock('@/services/notification.service');

import * as controller from '@/controllers/notification.controller';
import * as notificationService from '@/services/notification.service';

describe('notification.controller (unit)', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { body: {}, params: {}, query: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    } as any;
    next = jest.fn();
  });

  it('should return user notifications with pagination in getUserNotifications', async () => {
    req.currentUser = { users: { id: 7 } } as any;
    req.body = {
      whereConditions: { type: 'post', isRead: false, postId: 10 },
      orderConditions: { createdAt: 'desc' },
      pagination: { page: 2, pageSize: 5 }
    } as any;

    (notificationService.selectNotificationByConditions as jest.Mock)
      .mockResolvedValueOnce(Array.from({ length: 12 }, (_, index) => ({ id: index + 1 })))
      .mockResolvedValueOnce([{ id: 6 }, { id: 7 }, { id: 8 }, { id: 9 }, { id: 10 }]);

    await controller.getUserNotifications(req as Request, res as Response, next);

    expect(notificationService.selectNotificationByConditions).toHaveBeenCalledTimes(2);
    expect(res.status).toHaveBeenCalledWith(200);
    const responsePayload = (res.json as jest.Mock).mock.calls[0][0];
    expect(responsePayload.data.results).toHaveLength(5);
    expect(responsePayload.data.pagination.totalCount).toBe(12);
    expect(responsePayload.data.pagination.currentPage).toBe(2);
    expect(responsePayload.data.pagination.currentPageSize).toBe(5);
  });

  it('should call next when getUserNotifications throws', async () => {
    req.currentUser = { users: { id: 7 } } as any;
    req.body = null as any;

    await controller.getUserNotifications(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
  });

  it('should call next when ids missing in setReadUserNotification', async () => {
    req.currentUser = { users: { id: 7 } } as any;
    req.query = {} as any;

    await controller.setReadUserNotification(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
  });

  it('should set read notifications for array ids in setReadUserNotification', async () => {
    req.currentUser = { users: { id: 7 } } as any;
    req.query = { ids: ['1', '2', 'x'] } as any;

    (notificationService.updateNotificationByConditions as jest.Mock).mockResolvedValue({});

    await controller.setReadUserNotification(req as Request, res as Response, next);

    expect(notificationService.updateNotificationByConditions).toHaveBeenCalledWith(
      { isRead: true },
      {
        id: { operator: 'in', value: [1, 2] },
        userId: { operator: 'eq', value: 7 }
      }
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect((res.json as jest.Mock).mock.calls[0][0].data.ids).toEqual([1, 2]);
  });

  it('should set read notification for single id in setReadUserNotification', async () => {
    req.currentUser = { users: { id: 7 } } as any;
    req.query = { ids: '9' } as any;

    (notificationService.updateNotificationByConditions as jest.Mock).mockResolvedValue({});

    await controller.setReadUserNotification(req as Request, res as Response, next);

    expect(notificationService.updateNotificationByConditions).toHaveBeenCalledWith(
      { isRead: true },
      {
        id: { operator: 'in', value: [9] },
        userId: { operator: 'eq', value: 7 }
      }
    );
  });

  it('should update all notifications in setReadAllUserNotifications', async () => {
    req.currentUser = { users: { id: 7 } } as any;
    (notificationService.updateNotificationByConditions as jest.Mock).mockResolvedValue({});

    await controller.setReadAllUserNotifications(req as Request, res as Response, next);

    expect(notificationService.updateNotificationByConditions).toHaveBeenCalledWith(
      { isRead: true },
      { userId: { operator: 'eq', value: 7 } }
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('should return notifications when whereConditions empty in getUserNotifications', async () => {
    req.currentUser = { users: { id: 7 } } as any;
    req.body = {
      whereConditions: {},
      orderConditions: {},
      pagination: { page: 1, pageSize: 10 }
    } as any;

    (notificationService.selectNotificationByConditions as jest.Mock)
      .mockResolvedValueOnce([{ id: 1 }, { id: 2 }])
      .mockResolvedValueOnce([{ id: 1 }, { id: 2 }]);

    await controller.getUserNotifications(req as Request, res as Response, next);

    expect(notificationService.selectNotificationByConditions).toHaveBeenCalledTimes(2);
    const whereArg = (notificationService.selectNotificationByConditions as jest.Mock).mock.calls[0][0];
    expect(whereArg.userId.value).toBe(7);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('should map isRead false correctly in getUserNotifications', async () => {
    req.currentUser = { users: { id: 7 } } as any;
    req.body = {
      whereConditions: { isRead: false },
      orderConditions: {}
    } as any;

    (notificationService.selectNotificationByConditions as jest.Mock)
      .mockResolvedValueOnce([{ id: 1 }])
      .mockResolvedValueOnce([{ id: 1 }]);

    await controller.getUserNotifications(req as Request, res as Response, next);

    const whereArg = (notificationService.selectNotificationByConditions as jest.Mock).mock.calls[0][0];
    expect(whereArg.isRead).toEqual({ operator: 'eq', value: false });
  });

  it('should accept zero id in setReadUserNotification boundary case', async () => {
    req.currentUser = { users: { id: 7 } } as any;
    req.query = { ids: '0' } as any;

    (notificationService.updateNotificationByConditions as jest.Mock).mockResolvedValue({});

    await controller.setReadUserNotification(req as Request, res as Response, next);

    expect(notificationService.updateNotificationByConditions).toHaveBeenCalledWith(
      { isRead: true },
      {
        id: { operator: 'in', value: [0] },
        userId: { operator: 'eq', value: 7 }
      }
    );
  });

  it('should call next when currentUser is null in setReadAllUserNotifications', async () => {
    req.currentUser = null as any;

    await controller.setReadAllUserNotifications(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
  });

  it('should call next when currentUser is null in getUserNotifications', async () => {
    req.currentUser = null as any;
    req.body = { whereConditions: {}, orderConditions: {} } as any;

    await controller.getUserNotifications(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
  });
});
