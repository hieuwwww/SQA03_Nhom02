/**
 * Unit Tests: Quản lý thông tin cá nhân
 * File được test: src/controllers/user.controller.ts
 * Hàm được test trong file này:
 * - getUserProfile
 * - updateUserProfile
 * - getMyAvatar
 * - getUserAvatar
 * - updateUserAvatar
 *
 * Các hàm KHÔNG thuộc phạm vi file test này:
 * - changeUserPassword
 * - createUserAddress
 * - updateUserAddress
 * - removeUserAddress
 * - getUserAddresses
 * - setDefaultAddress
 * - getUserDefaultAddress
 * - createUserContact
 * - getUserContacts
 * - updateUserContact
 * - removeUserContact
 *
 * Lý do loại trừ:
 * - Không thuộc nghiệp vụ "quan ly thông tin cá nhân" theo scope da chon.
 * - Mỗi nhóm chức năng nên có scope riêng để dễ viết report và đối chiếu test case.
 *
 * Lưu ý về DB:
 * - Đây là unit test, tất cả DB/service đều được mock.
 * - CheckDB trong unit test được thể hiện bằng cách xác minh service truy cập/cập nhật DB được gọi đúng tham số.
 * - Rollback không áp dụng trong file này vì không ghi đọc DB thật.
 */

import { NextFunction, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';

// Mock tất cả dependency được import trong user.controller.ts
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
import * as assetService from '@/services/asset.service';
import * as fileUploadService from '@/services/fileUpload.service';

/**
 * Tạo mock response có thể chain được như Express Response thật.
 */
const createMockResponse = () => {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.cookie = jest.fn().mockReturnValue(res);
  return res;
};

/**
 * Mock `next()` để theo dõi trường hợp controller đẩy lỗi cho middleware xử lý lỗi.
 */
const mockNext = jest.fn() as NextFunction;

/**
 * Helper tạo request object gọn nhẹ cho từng test.
 */
const createMockRequest = (overrides: Partial<Request> = {}): Request =>
  ({
    params: {},
    query: {},
    body: {},
    currentUser: undefined,
    ...overrides
  } as unknown as Request);

/**
 * Dữ liệu `user detail` mẫu dùng chung cho các test.
 */
const MOCK_USER_DETAIL = {
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
};

/**
 * `currentUser` mẫu phục vụ cho hàm `updateUserProfile`.
 */
const MOCK_CURRENT_USER = {
  users: {
    id: 1,
    password: '$2b$10$hashedpassword',
    status: 'actived' as const,
    tokenVersion: 0
  },
  users_detail: MOCK_USER_DETAIL
};

describe('user.controller.ts - Quản lý thông tin cá nhân', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getUserProfile', () => {
    /**
     * TCQLTTCN1
     */
    it('TCQLTTCN1 - Tra ve 200 va userDetail khi userId hop le va ton tai', async () => {
      (userService.selectUserDetailById as jest.Mock).mockResolvedValue([MOCK_USER_DETAIL]);

      const req = createMockRequest({ params: { userId: '1' } });
      const res = createMockResponse();

      await userController.getUserProfile(req, res, mockNext);

      expect(userService.selectUserDetailById).toHaveBeenCalledWith(1);
      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: MOCK_USER_DETAIL
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    /**
     * TCQLTTCN2
     */
    it('TCQLTTCN2 - Trả về 404 khi userId không tồn tại', async () => {
      (userService.selectUserDetailById as jest.Mock).mockResolvedValue([]);

      const req = createMockRequest({ params: { userId: '9999' } });
      const res = createMockResponse();

      await userController.getUserProfile(req, res, mockNext);

      expect(userService.selectUserDetailById).toHaveBeenCalledWith(9999);
      expect(res.status).toHaveBeenCalledWith(StatusCodes.NOT_FOUND);
      expect(res.json).toHaveBeenCalledWith(
        expect.not.objectContaining({ data: expect.anything() })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    /**
     * TCQLTTCN3
     */
    it('TCQLTTCN3 - Trả về 400 khi không có userId trong params', async () => {
      const req = createMockRequest({ params: {} });
      const res = createMockResponse();

      await userController.getUserProfile(req, res, mockNext);

      expect(userService.selectUserDetailById).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: StatusCodes.BAD_REQUEST })
      );
      expect(res.status).not.toHaveBeenCalled();
    });

    /**
     * TCQLTTCN4
     */
    it('TCQLTTCN4 - Goi next(error) khi selectUserDetailById throw exception', async () => {
      const mockError = new Error('DB connection failed');
      (userService.selectUserDetailById as jest.Mock).mockRejectedValue(mockError);

      const req = createMockRequest({ params: { userId: '1' } });
      const res = createMockResponse();

      await userController.getUserProfile(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(mockError);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    /**
     * TCQLTTCN5
     */
    it('TCQLTTCN5 - Trả về 400 khi userId là chuỗi không hợp lệ (NaN)', async () => {
      (userService.selectUserDetailById as jest.Mock).mockResolvedValue([]);

      const req = createMockRequest({ params: { userId: 'abc' } });
      const res = createMockResponse();

      await userController.getUserProfile(req, res, mockNext);

      expect(userService.selectUserDetailById).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: StatusCodes.BAD_REQUEST })
      );
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('updateUserProfile', () => {
    /**
     * TCQLTTCN6
     */
    it('TCQLTTCN6 - Trả về 200 và userDetail mới khi cập nhật đầy đủ', async () => {
      const updatedUserDetail = {
        ...MOCK_USER_DETAIL,
        firstName: 'Tran',
        bio: 'Updated bio'
      };

      (userService.updateUserDetailById as jest.Mock).mockResolvedValue([]);
      (userService.selectUserDetailByEmail as jest.Mock).mockResolvedValue([updatedUserDetail]);

      const req = createMockRequest({
        currentUser: MOCK_CURRENT_USER,
        body: {
          firstName: 'Tran',
          lastName: 'An',
          bio: 'Updated bio',
          phone: '0901234567',
          gender: 'male',
          dob: '1999-01-01',
          role: 'renter'
        }
      });
      const res = createMockResponse();

      await userController.updateUserProfile(req, res, mockNext);

      expect(userService.updateUserDetailById).toHaveBeenCalledWith(
        MOCK_USER_DETAIL.userId,
        expect.objectContaining({
          firstName: 'Tran',
          bio: 'Updated bio'
        })
      );
      expect(userService.selectUserDetailByEmail).toHaveBeenCalledWith(MOCK_USER_DETAIL.email);
      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Update profile successfully!',
          data: updatedUserDetail
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    /**
     * TCQLTTCN7
     */
    it('TCQLTTCN7 - Cập nhật thành công với partial update chỉ firstName', async () => {
      const partialUpdatedUserDetail = {
        ...MOCK_USER_DETAIL,
        firstName: 'Minh'
      };

      (userService.updateUserDetailById as jest.Mock).mockResolvedValue([]);
      (userService.selectUserDetailByEmail as jest.Mock).mockResolvedValue([partialUpdatedUserDetail]);

      const req = createMockRequest({
        currentUser: MOCK_CURRENT_USER,
        body: { firstName: 'Minh' }
      });
      const res = createMockResponse();

      await userController.updateUserProfile(req, res, mockNext);

      const updatePayload = (userService.updateUserDetailById as jest.Mock).mock.calls[0][1];

      expect(updatePayload).toHaveProperty('firstName', 'Minh');
      expect(updatePayload).not.toHaveProperty('gender');
      expect(updatePayload).not.toHaveProperty('bio');
      expect(updatePayload).not.toHaveProperty('phone');
      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Update profile successfully!',
          data: partialUpdatedUserDetail
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    /**
     * TCQLTTCN8
     */
    it('TCQLTTCN8 - Xác minh dob được chuyển đổi sang Date object đúng', async () => {
      (userService.updateUserDetailById as jest.Mock).mockResolvedValue([]);
      (userService.selectUserDetailByEmail as jest.Mock).mockResolvedValue([MOCK_USER_DETAIL]);

      const req = createMockRequest({
        currentUser: MOCK_CURRENT_USER,
        body: { dob: '1999-01-01' }
      });
      const res = createMockResponse();

      await userController.updateUserProfile(req, res, mockNext);

      const updatePayload = (userService.updateUserDetailById as jest.Mock).mock.calls[0][1];

      expect(Object.prototype.toString.call(updatePayload.dob)).toBe('[object Date]');
      expect(Number.isNaN(updatePayload.dob.getTime())).toBe(false);
      expect(updatePayload.dob.toISOString()).toContain('1999-01-01');
      expect(mockNext).not.toHaveBeenCalled();
    });

    /**
     * TCQLTTCN9
     */
    it('TCQLTTCN9 - Khi khong truyen dob, payload khong chua truong dob', async () => {
      (userService.updateUserDetailById as jest.Mock).mockResolvedValue([]);
      (userService.selectUserDetailByEmail as jest.Mock).mockResolvedValue([MOCK_USER_DETAIL]);

      const req = createMockRequest({
        currentUser: MOCK_CURRENT_USER,
        body: { firstName: 'Minh' }
      });
      const res = createMockResponse();

      await userController.updateUserProfile(req, res, mockNext);

      const updatePayload = (userService.updateUserDetailById as jest.Mock).mock.calls[0][1];

      expect(updatePayload).not.toHaveProperty('dob');
      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(mockNext).not.toHaveBeenCalled();
    });

    /**
     * TCQLTTCN10
     */
    it('TCQLTTCN10 - Goi next(error) khi service throw exception', async () => {
      const mockError = new Error('DB connection failed');
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
      (userService.updateUserDetailById as jest.Mock).mockRejectedValue(mockError);

      const req = createMockRequest({
        currentUser: MOCK_CURRENT_USER,
        body: { firstName: 'Minh' }
      });
      const res = createMockResponse();

      await userController.updateUserProfile(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(mockError);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
      consoleLogSpy.mockRestore();
    });

    /**
     * TCQLTTCN11
     */
    it('TCQLTTCN11 - Goi next(error) khi selectUserDetailByEmail throw exception', async () => {
      const mockError = new Error('Select failed');
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
      (userService.updateUserDetailById as jest.Mock).mockResolvedValue([]);
      (userService.selectUserDetailByEmail as jest.Mock).mockRejectedValue(mockError);

      const req = createMockRequest({
        currentUser: MOCK_CURRENT_USER,
        body: { firstName: 'Minh' }
      });
      const res = createMockResponse();

      await userController.updateUserProfile(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(mockError);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
      consoleLogSpy.mockRestore();
    });
  });

  describe('getMyAvatar', () => {
    /**
     * TCQLTTCN12
     */
    it('TCQLTTCN12 - Tra ve 200 va avatar asset khi co avatarAssetId', async () => {
      const mockAvatarAsset = {
        id: 5,
        url: 'https://cdn.example.com/avatar.jpg',
        type: 'image'
      };
      (assetService.selectAssetById as jest.Mock).mockResolvedValue([mockAvatarAsset]);

      const req = createMockRequest({
        currentUser: {
          ...MOCK_CURRENT_USER,
          users_detail: { ...MOCK_USER_DETAIL, avatarAssetId: 5 }
        }
      });
      const res = createMockResponse();

      await userController.getMyAvatar(req, res, mockNext);

      expect(assetService.selectAssetById).toHaveBeenCalledWith(5);
      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: mockAvatarAsset
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    /**
     * TCQLTTCN13
     */
    it('TCQLTTCN13 - Tra ve 404 khi avatarAssetId la null', async () => {
      const req = createMockRequest({
        currentUser: {
          ...MOCK_CURRENT_USER,
          users_detail: { ...MOCK_USER_DETAIL, avatarAssetId: null }
        }
      });
      const res = createMockResponse();

      await userController.getMyAvatar(req, res, mockNext);

      expect(assetService.selectAssetById).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(StatusCodes.NOT_FOUND);
      expect(mockNext).not.toHaveBeenCalled();
    });

    /**
     * TCQLTTCN14
     */
    it('TCQLTTCN14 - Trả về 404 khi selectAssetById trả về []', async () => {
      (assetService.selectAssetById as jest.Mock).mockResolvedValue([]);

      const req = createMockRequest({
        currentUser: {
          ...MOCK_CURRENT_USER,
          users_detail: { ...MOCK_USER_DETAIL, avatarAssetId: 5 }
        }
      });
      const res = createMockResponse();

      await userController.getMyAvatar(req, res, mockNext);

      expect(assetService.selectAssetById).toHaveBeenCalledWith(5);
      expect(res.status).toHaveBeenCalledWith(StatusCodes.NOT_FOUND);
      expect(mockNext).not.toHaveBeenCalled();
    });

    /**
     * TCQLTTCN15
     */
    it('TCQLTTCN15 - Goi next(error) khi selectAssetById throw exception', async () => {
      const mockError = new Error('Database connection failed');
      (assetService.selectAssetById as jest.Mock).mockRejectedValue(mockError);

      const req = createMockRequest({
        currentUser: {
          ...MOCK_CURRENT_USER,
          users_detail: { ...MOCK_USER_DETAIL, avatarAssetId: 5 }
        }
      });
      const res = createMockResponse();

      await userController.getMyAvatar(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(mockError);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });
  });

  describe('getUserAvatar', () => {
    /**
     * TCQLTTCN16
     */
    it('TCQLTTCN16 - Tra ve 200 va avatar khi userId hop le va co avatar', async () => {
      const mockAvatarAsset = { id: 5, url: 'https://cdn.example.com/avatar.jpg' };
      (userService.selectUserAvatarByUserId as jest.Mock).mockResolvedValue([mockAvatarAsset]);

      const req = createMockRequest({ params: { userId: '1' } });
      const res = createMockResponse();

      await userController.getUserAvatar(req, res, mockNext);

      expect(userService.selectUserAvatarByUserId).toHaveBeenCalledWith(1);
      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: mockAvatarAsset
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    /**
     * TCQLTTCN17
     */
    it('TCQLTTCN17 - Tra ve 404 khi user chua co avatar', async () => {
      (userService.selectUserAvatarByUserId as jest.Mock).mockResolvedValue([]);

      const req = createMockRequest({ params: { userId: '1' } });
      const res = createMockResponse();

      await userController.getUserAvatar(req, res, mockNext);

      expect(userService.selectUserAvatarByUserId).toHaveBeenCalledWith(1);
      expect(res.status).toHaveBeenCalledWith(StatusCodes.NOT_FOUND);
      expect(mockNext).not.toHaveBeenCalled();
    });

    /**
     * TCQLTTCN18
     */
    it('TCQLTTCN18 - Gọi next(ApiError 400) khi không có userId', async () => {
      const req = createMockRequest({ params: {} });
      const res = createMockResponse();

      await userController.getUserAvatar(req, res, mockNext);

      expect(userService.selectUserAvatarByUserId).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: StatusCodes.BAD_REQUEST })
      );
      expect(res.status).not.toHaveBeenCalled();
    });

    /**
     * TCQLTTCN19
     */
    it('TCQLTTCN19 - Gọi next(ApiError 400) khi userId không phải số hợp lệ', async () => {
      const req = createMockRequest({ params: { userId: 'abc' } });
      const res = createMockResponse();

      await userController.getUserAvatar(req, res, mockNext);

      expect(userService.selectUserAvatarByUserId).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: StatusCodes.BAD_REQUEST })
      );
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('updateUserAvatar', () => {
    const mockUploadResult = {
      public_id: 'avatars/abc123',
      secure_url: 'https://cdn.cloudinary.com/abc123.jpg',
      forma: 'jpg'
    };

    /**
     * TCQLTTCN20
     */
    it('TCQLTTCN20 - Upload avatar thành công khi user chưa có avatar', async () => {
      (fileUploadService.uploadAvatar as jest.Mock).mockResolvedValue(mockUploadResult);
      (assetService.insertAsset as jest.Mock).mockResolvedValue([{ id: 10 }]);
      (assetService.selectAssetsByConditions as jest.Mock).mockResolvedValue([
        { id: 10, url: mockUploadResult.secure_url }
      ]);
      (userService.updateUserDetailById as jest.Mock).mockResolvedValue([]);

      const req = createMockRequest({
        file: { mimetype: 'image/jpeg', buffer: Buffer.from('fake') } as Express.Multer.File,
        currentUser: {
          ...MOCK_CURRENT_USER,
          users_detail: { ...MOCK_USER_DETAIL, avatarAssetId: null }
        }
      });
      const res = createMockResponse();

      await userController.updateUserAvatar(req, res, mockNext);

      expect(assetService.insertAsset).toHaveBeenCalledWith(
        expect.objectContaining({
          folder: 'avatars',
          type: 'image'
        })
      );
      expect(userService.updateUserDetailById).toHaveBeenCalledWith(
        MOCK_USER_DETAIL.userId,
        expect.objectContaining({
          avatarAssetId: 10
        })
      );
      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(mockNext).not.toHaveBeenCalled();
    });

    /**
     * TCQLTTCN21
     */
    it('TCQLTTCN21 - Upload avatar thành công khi user đã có avatar cũ', async () => {
      const oldAvatarAsset = {
        id: 5,
        name: 'avatars/old',
        url: 'https://old.jpg'
      };

      (fileUploadService.uploadAvatar as jest.Mock).mockResolvedValue(mockUploadResult);
      (assetService.selectAssetById as jest.Mock).mockResolvedValue([oldAvatarAsset]);
      (fileUploadService.deleteResource as jest.Mock).mockResolvedValue({});
      (assetService.updateAssetById as jest.Mock).mockResolvedValue([]);
      (assetService.selectAssetsByConditions as jest.Mock).mockResolvedValue([
        { id: 5, url: mockUploadResult.secure_url }
      ]);
      (userService.updateUserDetailById as jest.Mock).mockResolvedValue([]);

      const req = createMockRequest({
        file: { mimetype: 'image/png', buffer: Buffer.from('fake') } as Express.Multer.File,
        currentUser: {
          ...MOCK_CURRENT_USER,
          users_detail: { ...MOCK_USER_DETAIL, avatarAssetId: 5 }
        }
      });
      const res = createMockResponse();

     await userController.updateUserAvatar(req, res, mockNext);

      expect(assetService.insertAsset).not.toHaveBeenCalled();
      expect(assetService.selectAssetById).toHaveBeenCalledWith(5);
      expect(fileUploadService.deleteResource).toHaveBeenCalledWith(oldAvatarAsset.name, 'image');
      expect(assetService.updateAssetById).toHaveBeenCalledWith(
        5,
        expect.objectContaining({
          name: mockUploadResult.public_id,
          url: mockUploadResult.secure_url
        })
      );
      expect(userService.updateUserDetailById).toHaveBeenCalledWith(
        MOCK_USER_DETAIL.userId,
        expect.objectContaining({
          avatarAssetId: 5
        })
      );
      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(mockNext).not.toHaveBeenCalled();
    });

    /**
     * TCQLTTCN22
     */
    it('TCQLTTCN22 - Trả về 400 khi không có file', async () => {
      const req = createMockRequest({
        currentUser: MOCK_CURRENT_USER
      });
      const res = createMockResponse();

      await userController.updateUserAvatar(req, res, mockNext);

      expect(fileUploadService.uploadAvatar).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(StatusCodes.BAD_REQUEST);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'No file provided.'
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    /**
     * TCQLTTCN23
     */
    it('TCQLTTCN23 - Tra ve 400 khi file khong phai image', async () => {
      const req = createMockRequest({
        file: { mimetype: 'application/pdf' } as Express.Multer.File,
        currentUser: MOCK_CURRENT_USER
      });
      const res = createMockResponse();

      await userController.updateUserAvatar(req, res, mockNext);

      expect(fileUploadService.uploadAvatar).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(StatusCodes.BAD_REQUEST);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Invalid file type. Only images are allowed.'
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    /**
     * TCQLTTCN24
     */
    it('TCQLTTCN24 - Goi next(error) khi uploadAvatar throw exception', async () => {
      const mockError = new Error('Cloudinary upload failed');
      (fileUploadService.uploadAvatar as jest.Mock).mockRejectedValue(mockError);

      const req = createMockRequest({
        file: { mimetype: 'image/jpeg', buffer: Buffer.from('fake') } as Express.Multer.File,
        currentUser: {
          ...MOCK_CURRENT_USER,
          users_detail: { ...MOCK_USER_DETAIL, avatarAssetId: null }
        }
      });
      const res = createMockResponse();

      await userController.updateUserAvatar(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(mockError);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    /**
     * TCQLTTCN25
     */
    it('TCQLTTCN25 - Goi next(error) khi selectAssetsByConditions throw exception', async () => {
      const mockError = new Error('Database query failed');
      (fileUploadService.uploadAvatar as jest.Mock).mockResolvedValue(mockUploadResult);
      (assetService.insertAsset as jest.Mock).mockResolvedValue([{ id: 10 }]);
      (userService.updateUserDetailById as jest.Mock).mockResolvedValue([]);
      (assetService.selectAssetsByConditions as jest.Mock).mockRejectedValue(mockError);

      const req = createMockRequest({
        file: { mimetype: 'image/jpeg', buffer: Buffer.from('fake') } as Express.Multer.File,
        currentUser: {
          ...MOCK_CURRENT_USER,
          users_detail: { ...MOCK_USER_DETAIL, avatarAssetId: null }
        }
      });
      const res = createMockResponse();

      await userController.updateUserAvatar(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(mockError);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });
  });
});
