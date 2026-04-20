/**
 * Unit Tests: Quản lý thông tin liên hệ
 * File được test: src/controllers/user.controller.ts
 * Hàm được test trong file này:
 * - createUserContact
 * - getUserContacts
 * - updateUserContact
 * - removeUserContact
 *
 * Các hàm KHÔNG thuộc phạm vi file test này:
 * - xác thực email
 * - avatar
 * - profile
 * - địa chỉ
 * - mật khẩu
 *
 * Lưu ý về DB:
 * - Đây là unit test, tất cả DB/service đều được mock.
 * - CheckDB được thể hiện bằng cách xác minh service được gọi đúng tham số.
 * - Rollback không áp dụng vì không dùng DB thật.
 */

import { NextFunction, Request, Response } from 'express';
import { ReasonPhrases, StatusCodes } from 'http-status-codes';

jest.mock('@/services/user.service', () => ({
  selectUserDetailById: jest.fn(),
  selectUserDetailByEmail: jest.fn(),
  updateUserDetailById: jest.fn(),
  selectFullUserByConditions: jest.fn(),
  selectUserAvatarByUserId: jest.fn(),
  selectUserContactByUserId: jest.fn(),
  selectUserContactByContactId: jest.fn(),
  insertUserContact: jest.fn(),
  updateUserContactByContactId: jest.fn(),
  deleteUserContactByContactId: jest.fn(),
  updateUserById: jest.fn()
}));

jest.mock('@/services/address.service', () => ({
  searchAddressByConditions: jest.fn(),
  insertAddress: jest.fn(),
  updateAddressById: jest.fn(),
  updateAddressByConditions: jest.fn(),
  deleteAddressByConditions: jest.fn(),
  deleteAddressById: jest.fn()
}));

jest.mock('@/services/asset.service', () => ({
  selectAssetById: jest.fn(),
  selectAssetsByConditions: jest.fn(),
  insertAsset: jest.fn(),
  updateAssetById: jest.fn()
}));

jest.mock('@/services/fileUpload.service', () => ({
  uploadAvatar: jest.fn(),
  deleteResource: jest.fn()
}));

jest.mock('@/services/location.service', () => ({
  geocodingByGoong: jest.fn()
}));

jest.mock('@/services/token.service', () => ({
  searchTokenByCondition: jest.fn(),
  insertToken: jest.fn(),
  removeTokenByCondition: jest.fn()
}));

jest.mock('@/services/post.service', () => ({
  updatePostByConditions: jest.fn()
}));

jest.mock('@/controllers/auth.controller', () => ({
  handleUserTokenProcess: jest.fn()
}));

jest.mock('@/utils/email.helper', () => ({
  sendEmail: jest.fn(),
  generateVerifyEmailContent: jest.fn().mockReturnValue('<html>otp</html>')
}));

import * as userController from '@/controllers/user.controller';
import * as userService from '@/services/user.service';

const createMockResponse = () => {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.cookie = jest.fn().mockReturnValue(res);
  return res;
};

const mockNext = jest.fn() as NextFunction;

const createMockRequest = (overrides: Partial<Request> = {}): Request =>
  ({
    params: {},
    query: {},
    body: {},
    currentUser: undefined,
    ...overrides
  } as unknown as Request);

const MOCK_CURRENT_USER = {
  users: {
    id: 1,
    password: '$2b$10$hashedpassword',
    status: 'actived' as const,
    tokenVersion: 0
  },
  users_detail: {
    userId: 1,
    email: 'test@example.com',
    firstName: 'Nguyen',
    lastName: 'An',
    phone: '0901234567',
    bio: 'Hello world',
    gender: 'male' as const,
    dob: null,
    role: 'renter' as const,
    isEmailVerified: true,
    isPhoneVerified: false,
    avatarAssetId: null,
    createdAt: new Date(),
    updatedAt: new Date()
  }
};

const MOCK_CONTACT = {
  id: 10,
  userId: 1,
  contactType: 'zalo',
  contactContent: '0901234567'
};

describe('user.controller.ts - Quản lý thông tin liên hệ', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createUserContact', () => {
    /**
     * TCQLTTLH1
     */
    it('TCQLTTLH1 - Tạo thông tin liên hệ thành công', async () => {
      (userService.insertUserContact as jest.Mock).mockResolvedValue([{ id: 10 }]);

      const req = createMockRequest({
        currentUser: MOCK_CURRENT_USER,
        body: {
          contactType: 'zalo',
          contactContent: '0901234567'
        }
      });
      const res = createMockResponse();

      await userController.createUserContact(req, res, mockNext);

      expect(userService.insertUserContact).toHaveBeenCalledWith({
        contactType: 'zalo',
        contactContent: '0901234567',
        userId: 1
      });
      expect(res.status).toHaveBeenCalledWith(StatusCodes.CREATED);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { id: 10 }
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    /**
     * TCQLTTLH2
     */
    it('TCQLTTLH2 - Goi next(error) khi insertUserContact throw exception', async () => {
      const mockError = new Error('Database insert failed');
      (userService.insertUserContact as jest.Mock).mockRejectedValue(mockError);

      const req = createMockRequest({
        currentUser: MOCK_CURRENT_USER,
        body: {
          contactType: 'zalo',
          contactContent: '0901234567'
        }
      });
      const res = createMockResponse();

      await userController.createUserContact(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(mockError);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });
  });

  describe('getUserContacts', () => {
    /**
     * TCQLTTLH3
     */
    it('TCQLTTLH3 - Gọi next(ApiError 400) khi thiếu userId', async () => {
      const req = createMockRequest({ params: {} });
      const res = createMockResponse();

      await userController.getUserContacts(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: StatusCodes.BAD_REQUEST })
      );
      expect(res.status).not.toHaveBeenCalled();
    });

    /**
     * TCQLTTLH4
     */
    it('TCQLTTLH4 - Lấy danh sách thông tin liên hệ thành công', async () => {
      (userService.selectUserContactByUserId as jest.Mock).mockResolvedValue([MOCK_CONTACT]);

      const req = createMockRequest({ params: { userId: '1' } });
      const res = createMockResponse();

      await userController.getUserContacts(req, res, mockNext);

      expect(userService.selectUserContactByUserId).toHaveBeenCalledWith(1);
      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [MOCK_CONTACT]
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    /**
     * TCQLTTLH5
     */
    it('TCQLTTLH5 - Trả về 200 với data rỗng khi user chưa có thông tin liên hệ', async () => {
      (userService.selectUserContactByUserId as jest.Mock).mockResolvedValue([]);

      const req = createMockRequest({ params: { userId: '1' } });
      const res = createMockResponse();

      await userController.getUserContacts(req, res, mockNext);

      expect(userService.selectUserContactByUserId).toHaveBeenCalledWith(1);
      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: []
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    /**
     * TCQLTTLH6
     */
    it('TCQLTTLH6 - Goi next(error) khi selectUserContactByUserId throw exception', async () => {
      const mockError = new Error('Database query failed');
      (userService.selectUserContactByUserId as jest.Mock).mockRejectedValue(mockError);

      const req = createMockRequest({ params: { userId: '1' } });
      const res = createMockResponse();

      await userController.getUserContacts(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(mockError);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    /**
     * TCQLTTLH7
     */
    it('TCQLTTLH7 - Trả về 400 khi userId không phải số hợp lệ', async () => {
      (userService.selectUserContactByUserId as jest.Mock).mockResolvedValue([]);

      const req = createMockRequest({ params: { userId: 'abc' } });
      const res = createMockResponse();

      await userController.getUserContacts(req, res, mockNext);

      expect(userService.selectUserContactByUserId).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: StatusCodes.BAD_REQUEST })
      );
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('updateUserContact', () => {
    /**
     * TCQLTTLH8
     */
    it('TCQLTTLH8 - Gọi next(ApiError 400) khi thiếu contactId', async () => {
      const req = createMockRequest({
        currentUser: MOCK_CURRENT_USER,
        params: {},
        body: {
          contactType: 'telegram',
          contactContent: '@newcontact'
        }
      });
      const res = createMockResponse();

      await userController.updateUserContact(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: StatusCodes.BAD_REQUEST })
      );
      expect(res.status).not.toHaveBeenCalled();
    });

    /**
     * TCQLTTLH9
     */
    it('TCQLTTLH9 - Gọi next(ApiError 404) khi contact không tồn tại', async () => {
      (userService.selectUserContactByContactId as jest.Mock).mockResolvedValue([]);

      const req = createMockRequest({
        currentUser: MOCK_CURRENT_USER,
        params: { contactId: '10' },
        body: {
          contactType: 'telegram',
          contactContent: '@newcontact'
        }
      });
      const res = createMockResponse();

      await userController.updateUserContact(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: StatusCodes.NOT_FOUND })
      );
      expect(res.status).not.toHaveBeenCalled();
    });

    /**
     * TCQLTTLH10
     */
    it('TCQLTTLH10 - Trả về 400 khi contactId không phải số hợp lệ', async () => {
      (userService.selectUserContactByContactId as jest.Mock).mockResolvedValue([]);

      const req = createMockRequest({
        currentUser: MOCK_CURRENT_USER,
        params: { contactId: 'abc' },
        body: {
          contactType: 'telegram',
          contactContent: '@newcontact'
        }
      });
      const res = createMockResponse();

      await userController.updateUserContact(req, res, mockNext);

      expect(userService.selectUserContactByContactId).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: StatusCodes.BAD_REQUEST })
      );
      expect(res.status).not.toHaveBeenCalled();
    });

    /**
     * TCQLTTLH11
     */
    it('TCQLTTLH11 - Gọi next(ApiError 403) khi contact không thuộc current user', async () => {
      (userService.selectUserContactByContactId as jest.Mock).mockResolvedValue([
        { ...MOCK_CONTACT, userId: 2 }
      ]);

      const req = createMockRequest({
        currentUser: MOCK_CURRENT_USER,
        params: { contactId: '10' },
        body: {
          contactType: 'telegram',
          contactContent: '@newcontact'
        }
      });
      const res = createMockResponse();

      await userController.updateUserContact(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: StatusCodes.FORBIDDEN })
      );
      expect(res.status).not.toHaveBeenCalled();
    });

    /**
     * TCQLTTLH12
     */
    it('TCQLTTLH12 - Cập nhật thông tin liên hệ thành công', async () => {
      (userService.selectUserContactByContactId as jest.Mock).mockResolvedValue([MOCK_CONTACT]);
      (userService.updateUserContactByContactId as jest.Mock).mockResolvedValue([]);

      const req = createMockRequest({
        currentUser: MOCK_CURRENT_USER,
        params: { contactId: '10' },
        body: {
          contactType: 'telegram',
          contactContent: '@newcontact'
        }
      });
      const res = createMockResponse();

      await userController.updateUserContact(req, res, mockNext);

      expect(userService.updateUserContactByContactId).toHaveBeenCalledWith(10, {
        contactType: 'telegram',
        contactContent: '@newcontact'
      });
      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { id: 10 }
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    /**
     * TCQLTTLH13
     */
    it('TCQLTTLH13 - Goi next(error) khi updateUserContactByContactId throw exception', async () => {
      const mockError = new Error('Database update failed');
      (userService.selectUserContactByContactId as jest.Mock).mockResolvedValue([MOCK_CONTACT]);
      (userService.updateUserContactByContactId as jest.Mock).mockRejectedValue(mockError);

      const req = createMockRequest({
        currentUser: MOCK_CURRENT_USER,
        params: { contactId: '10' },
        body: {
          contactType: 'telegram',
          contactContent: '@newcontact'
        }
      });
      const res = createMockResponse();

      await userController.updateUserContact(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(mockError);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    /**
     * TCQLTTLH14
     */
    it('TCQLTTLH14 - Goi next(error) khi selectUserContactByContactId throw exception', async () => {
      const mockError = new Error('Database query failed');
      (userService.selectUserContactByContactId as jest.Mock).mockRejectedValue(mockError);

      const req = createMockRequest({
        currentUser: MOCK_CURRENT_USER,
        params: { contactId: '10' },
        body: {
          contactType: 'telegram',
          contactContent: '@newcontact'
        }
      });
      const res = createMockResponse();

      await userController.updateUserContact(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(mockError);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });
  });

  describe('removeUserContact', () => {
    /**
     * TCQLTTLH15
     */
    it('TCQLTTLH15 - Gọi next(ApiError 400) khi thiếu contactId', async () => {
      const req = createMockRequest({
        currentUser: MOCK_CURRENT_USER,
        params: {}
      });
      const res = createMockResponse();

      await userController.removeUserContact(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: StatusCodes.BAD_REQUEST })
      );
      expect(res.status).not.toHaveBeenCalled();
    });

    /**
     * TCQLTTLH16
     */
    it('TCQLTTLH16 - Gọi next(ApiError 404) khi contact không tồn tại', async () => {
      (userService.selectUserContactByContactId as jest.Mock).mockResolvedValue([]);

      const req = createMockRequest({
        currentUser: MOCK_CURRENT_USER,
        params: { contactId: '10' }
      });
      const res = createMockResponse();

      await userController.removeUserContact(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: StatusCodes.NOT_FOUND })
      );
      expect(res.status).not.toHaveBeenCalled();
    });

    /**
     * TCQLTTLH17
     */
    it('TCQLTTLH17 - Trả về 400 khi contactId không phải số hợp lệ', async () => {
      (userService.selectUserContactByContactId as jest.Mock).mockResolvedValue([]);

      const req = createMockRequest({
        currentUser: MOCK_CURRENT_USER,
        params: { contactId: 'abc' }
      });
      const res = createMockResponse();

      await userController.removeUserContact(req, res, mockNext);

      expect(userService.selectUserContactByContactId).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: StatusCodes.BAD_REQUEST })
      );
      expect(res.status).not.toHaveBeenCalled();
    });

    /**
     * TCQLTTLH18
     */
    it('TCQLTTLH18 - Gọi next(ApiError 403) khi contact không thuộc current user', async () => {
      (userService.selectUserContactByContactId as jest.Mock).mockResolvedValue([
        { ...MOCK_CONTACT, userId: 2 }
      ]);

      const req = createMockRequest({
        currentUser: MOCK_CURRENT_USER,
        params: { contactId: '10' }
      });
      const res = createMockResponse();

      await userController.removeUserContact(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: StatusCodes.FORBIDDEN })
      );
      expect(res.status).not.toHaveBeenCalled();
    });

    /**
     * TCQLTTLH19
     */
    it('TCQLTTLH19 - Xóa thông tin liên hệ thành công', async () => {
      (userService.selectUserContactByContactId as jest.Mock).mockResolvedValue([MOCK_CONTACT]);
      (userService.deleteUserContactByContactId as jest.Mock).mockResolvedValue([]);

      const req = createMockRequest({
        currentUser: MOCK_CURRENT_USER,
        params: { contactId: '10' }
      });
      const res = createMockResponse();

      await userController.removeUserContact(req, res, mockNext);

      expect(userService.deleteUserContactByContactId).toHaveBeenCalledWith(10);
      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { id: 10 }
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    /**
     * TCQLTTLH20
     */
    it('TCQLTTLH20 - Goi next(error) khi deleteUserContactByContactId throw exception', async () => {
      const mockError = new Error('Database delete failed');
      (userService.selectUserContactByContactId as jest.Mock).mockResolvedValue([MOCK_CONTACT]);
      (userService.deleteUserContactByContactId as jest.Mock).mockRejectedValue(mockError);

      const req = createMockRequest({
        currentUser: MOCK_CURRENT_USER,
        params: { contactId: '10' }
      });
      const res = createMockResponse();

      await userController.removeUserContact(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(mockError);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    /**
     * TCQLTTLH21
     */
    it('TCQLTTLH21 - Goi next(error) khi selectUserContactByContactId throw exception', async () => {
      const mockError = new Error('Database query failed');
      (userService.selectUserContactByContactId as jest.Mock).mockRejectedValue(mockError);

      const req = createMockRequest({
        currentUser: MOCK_CURRENT_USER,
        params: { contactId: '10' }
      });
      const res = createMockResponse();

      await userController.removeUserContact(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(mockError);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });
  });
});
