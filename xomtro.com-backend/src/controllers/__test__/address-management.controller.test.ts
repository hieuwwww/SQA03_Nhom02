

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
import * as addressService from '@/services/address.service';
import * as locationService from '@/services/location.service';

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

const MOCK_ADDRESS = {
  id: 10,
  userId: 1,
  provinceName: 'Ho Chi Minh',
  districtName: 'District 1',
  wardName: 'Ben Nghe',
  detail: '123 Nguyen Hue',
  longitude: 106.7009,
  latitude: 10.7769,
  isDefault: true,
  addressCode: 'ADDR001'
};

describe('user.controller.ts - Quản lý địa chỉ', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createUserAddress', () => {
    /**
     * TCQLDC1
     */
    it('TCQLDC1 - Tạo địa chỉ thành công khi đã có tọa độ', async () => {
      (addressService.searchAddressByConditions as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([MOCK_ADDRESS]);
      (addressService.insertAddress as jest.Mock).mockResolvedValue([{ id: 10 }]);

      const req = createMockRequest({
        currentUser: MOCK_CURRENT_USER,
        body: {
          provinceName: 'Ho Chi Minh',
          districtName: 'District 1',
          wardName: 'Ben Nghe',
          detail: '123 Nguyen Hue',
          longitude: 106.7009,
          latitude: 10.7769,
          addressCode: 'ADDR001'
        }
      });
      const res = createMockResponse();

      await userController.createUserAddress(req, res, mockNext);

      expect(addressService.insertAddress).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 1,
          isDefault: true,
          longitude: 106.7009,
          latitude: 10.7769
        })
      );
      expect(res.status).toHaveBeenCalledWith(StatusCodes.CREATED);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [MOCK_ADDRESS]
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    /**
     * TCQLDC2
     */
    it('TCQLDC2 - Gọi geocoding khi thiếu tọa độ', async () => {
      (locationService.geocodingByGoong as jest.Mock).mockResolvedValue({
        latitude: 10.8,
        longitude: 106.7
      });
      (addressService.searchAddressByConditions as jest.Mock)
        .mockResolvedValueOnce([{ ...MOCK_ADDRESS, id: 99 }])
        .mockResolvedValueOnce([{ ...MOCK_ADDRESS, id: 11, isDefault: false, latitude: 10.8, longitude: 106.7 }]);
      (addressService.insertAddress as jest.Mock).mockResolvedValue([{ id: 11 }]);

      const req = createMockRequest({
        currentUser: MOCK_CURRENT_USER,
        body: {
          provinceName: 'Ho Chi Minh',
          districtName: 'District 1',
          wardName: 'Ben Nghe',
          detail: '456 Le Loi',
          addressCode: 'ADDR002'
        }
      });
      const res = createMockResponse();

      await userController.createUserAddress(req, res, mockNext);

      expect(locationService.geocodingByGoong).toHaveBeenCalledWith('456 Le Loi, Ben Nghe, District 1, Ho Chi Minh');
      expect(addressService.insertAddress).toHaveBeenCalledWith(
        expect.objectContaining({
          latitude: 10.8,
          longitude: 106.7,
          isDefault: false
        })
      );
      expect(res.status).toHaveBeenCalledWith(StatusCodes.CREATED);
      expect(mockNext).not.toHaveBeenCalled();
    });

    /**
     * TCQLDC3
     */
    it('TCQLDC3 - Vẫn tạo địa chỉ thành công khi geocoding thất bại', async () => {
      (locationService.geocodingByGoong as jest.Mock).mockRejectedValue(
        new Error('Geocoding service unavailable')
      );
      (addressService.searchAddressByConditions as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([MOCK_ADDRESS]);
      (addressService.insertAddress as jest.Mock).mockResolvedValue([{ id: 12 }]);

      const req = createMockRequest({
        currentUser: MOCK_CURRENT_USER,
        body: {
          provinceName: 'Ho Chi Minh',
          districtName: 'District 1',
          wardName: 'Ben Nghe',
          detail: '123 ABC'
        }
      });
      const res = createMockResponse();

      await userController.createUserAddress(req, res, mockNext);

      expect(locationService.geocodingByGoong).toHaveBeenCalled();
      expect(addressService.insertAddress).toHaveBeenCalledWith(
        expect.objectContaining({
          longitude: undefined,
          latitude: undefined,
          isDefault: true
        })
      );
      expect(res.status).toHaveBeenCalledWith(StatusCodes.CREATED);
      expect(mockNext).not.toHaveBeenCalled();
    });

    /**
     * TCQLDC4
     */
    it('TCQLDC4 - Gọi geocoding với chuỗi đúng khi detail trống', async () => {
      (locationService.geocodingByGoong as jest.Mock).mockResolvedValue({
        latitude: 10.8,
        longitude: 106.7
      });
      (addressService.searchAddressByConditions as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([MOCK_ADDRESS]);
      (addressService.insertAddress as jest.Mock).mockResolvedValue([{ id: 13 }]);

      const req = createMockRequest({
        currentUser: MOCK_CURRENT_USER,
        body: {
          provinceName: 'Ha Noi',
          districtName: 'Hoan Kiem',
          wardName: 'Phuc Xa'
        }
      });
      const res = createMockResponse();

      await userController.createUserAddress(req, res, mockNext);

      expect(locationService.geocodingByGoong).toHaveBeenCalledWith(', Phuc Xa, Hoan Kiem, Ha Noi');
      expect(res.status).toHaveBeenCalledWith(StatusCodes.CREATED);
      expect(mockNext).not.toHaveBeenCalled();
    });

    /**
     * TCQLDC5
     */
    it('TCQLDC5 - Goi next(error) khi insertAddress throw exception', async () => {
      const mockError = new Error('Database insert failed');
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
      (addressService.searchAddressByConditions as jest.Mock).mockResolvedValueOnce([]);
      (addressService.insertAddress as jest.Mock).mockRejectedValue(mockError);

      const req = createMockRequest({
        currentUser: MOCK_CURRENT_USER,
        body: {
          provinceName: 'Ho Chi Minh',
          districtName: 'District 1',
          wardName: 'Ben Nghe',
          longitude: 106.7,
          latitude: 10.7
        }
      });
      const res = createMockResponse();

      await userController.createUserAddress(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(mockError);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
      consoleLogSpy.mockRestore();
    });
  });

  describe('updateUserAddress', () => {
    /**
     * TCQLDC6
     */
    it('TCQLDC6 - Trả về 400 khi thiếu addressId', async () => {
      const req = createMockRequest({
        currentUser: MOCK_CURRENT_USER,
        params: {}
      });
      const res = createMockResponse();

      await userController.updateUserAddress(req, res, mockNext);

      expect(addressService.searchAddressByConditions).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(StatusCodes.BAD_REQUEST);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: ReasonPhrases.BAD_REQUEST
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    /**
     * TCQLDC7
     */
    it('TCQLDC7 - Gọi next(ApiError 404) khi địa chỉ không tồn tại', async () => {
      (addressService.searchAddressByConditions as jest.Mock).mockResolvedValue([]);

      const req = createMockRequest({
        currentUser: MOCK_CURRENT_USER,
        params: { addressId: '10' }
      });
      const res = createMockResponse();

      await userController.updateUserAddress(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: StatusCodes.NOT_FOUND })
      );
      expect(res.status).not.toHaveBeenCalled();
    });

    /**
     * TCQLDC8
     */
    it('TCQLDC8 - Cập nhật địa chỉ thành công', async () => {
      (addressService.searchAddressByConditions as jest.Mock)
        .mockResolvedValueOnce([MOCK_ADDRESS])
        .mockResolvedValueOnce([{ ...MOCK_ADDRESS, detail: '456 Le Loi' }]);
      (addressService.updateAddressById as jest.Mock).mockResolvedValue([]);

      const req = createMockRequest({
        currentUser: MOCK_CURRENT_USER,
        params: { addressId: '10' },
        body: {
          provinceName: 'Ho Chi Minh',
          districtName: 'District 1',
          wardName: 'Ben Nghe',
          detail: '456 Le Loi',
          longitude: 106.71,
          latitude: 10.77,
          addressCode: 'ADDR001'
        }
      });
      const res = createMockResponse();

      await userController.updateUserAddress(req, res, mockNext);

      expect(addressService.searchAddressByConditions).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          id: expect.objectContaining({ value: 10 }),
          userId: expect.objectContaining({ value: MOCK_CURRENT_USER.users.id })
        })
      );
      expect(addressService.updateAddressById).toHaveBeenCalledWith(
        10,
        expect.objectContaining({
          detail: '456 Le Loi',
          longitude: 106.71,
          latitude: 10.77
        })
      );
      expect(res.status).toHaveBeenCalledWith(StatusCodes.CREATED);
      expect(mockNext).not.toHaveBeenCalled();
    });

    /**
     * TCQLDC9
     */
    it('TCQLDC9 - Cập nhật thành công khi thiếu tọa độ và geocoding thành công', async () => {
      (addressService.searchAddressByConditions as jest.Mock)
        .mockResolvedValueOnce([MOCK_ADDRESS])
        .mockResolvedValueOnce([{ ...MOCK_ADDRESS, latitude: 10.8, longitude: 106.7 }]);
      (addressService.updateAddressById as jest.Mock).mockResolvedValue([]);
      (locationService.geocodingByGoong as jest.Mock).mockResolvedValue({
        latitude: 10.8,
        longitude: 106.7
      });

      const req = createMockRequest({
        currentUser: MOCK_CURRENT_USER,
        params: { addressId: '10' },
        body: {
          provinceName: 'Ho Chi Minh',
          districtName: 'District 1',
          wardName: 'Ben Nghe'
        }
      });
      const res = createMockResponse();

      await userController.updateUserAddress(req, res, mockNext);

      expect(locationService.geocodingByGoong).toHaveBeenCalledWith(
        'Ben Nghe, District 1, Ho Chi Minh'
      );
      expect(addressService.updateAddressById).toHaveBeenCalledWith(
        10,
        expect.objectContaining({
          latitude: 10.8,
          longitude: 106.7
        })
      );
      expect(res.status).toHaveBeenCalledWith(StatusCodes.CREATED);
      expect(mockNext).not.toHaveBeenCalled();
    });

    /**
     * TCQLDC10
     */
    it('TCQLDC10 - Vẫn cập nhật thành công khi geocoding thất bại', async () => {
      (addressService.searchAddressByConditions as jest.Mock)
        .mockResolvedValueOnce([MOCK_ADDRESS])
        .mockResolvedValueOnce([MOCK_ADDRESS]);
      (addressService.updateAddressById as jest.Mock).mockResolvedValue([]);
      (locationService.geocodingByGoong as jest.Mock).mockRejectedValue(
        new Error('Geocoding service unavailable')
      );

      const req = createMockRequest({
        currentUser: MOCK_CURRENT_USER,
        params: { addressId: '10' },
        body: {
          provinceName: 'Ho Chi Minh',
          districtName: 'District 1',
          wardName: 'Ben Nghe'
        }
      });
      const res = createMockResponse();

      await userController.updateUserAddress(req, res, mockNext);

      expect(locationService.geocodingByGoong).toHaveBeenCalled();
      expect(addressService.updateAddressById).toHaveBeenCalledWith(
        10,
        expect.objectContaining({
          longitude: undefined,
          latitude: undefined
        })
      );
      expect(res.status).toHaveBeenCalledWith(StatusCodes.CREATED);
      expect(mockNext).not.toHaveBeenCalled();
    });

    /**
     * TCQLDC11
     */
    it('TCQLDC11 - Goi next(error) khi updateAddressById throw exception', async () => {
      const mockError = new Error('Database update failed');
      (addressService.searchAddressByConditions as jest.Mock).mockResolvedValueOnce([MOCK_ADDRESS]);
      (addressService.updateAddressById as jest.Mock).mockRejectedValue(mockError);

      const req = createMockRequest({
        currentUser: MOCK_CURRENT_USER,
        params: { addressId: '10' },
        body: {
          provinceName: 'Ho Chi Minh',
          districtName: 'District 1',
          wardName: 'Ben Nghe',
          longitude: 106.71,
          latitude: 10.77
        }
      });
      const res = createMockResponse();

      await userController.updateUserAddress(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(mockError);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    /**
     * TCQLDC12
     */
    it('TCQLDC12 - Trả về 400 khi addressId không phải số hợp lệ', async () => {
      const req = createMockRequest({
        currentUser: MOCK_CURRENT_USER,
        params: { addressId: 'abc' }
      });
      const res = createMockResponse();

      await userController.updateUserAddress(req, res, mockNext);

      expect(addressService.searchAddressByConditions).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: StatusCodes.BAD_REQUEST })
      );
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('removeUserAddress', () => {
    /**
     * TCQLDC13
     */
    it('TCQLDC13 - Tra ve 400 khi khong truyen addressIds', async () => {
      const req = createMockRequest({
        currentUser: MOCK_CURRENT_USER,
        query: {}
      });
      const res = createMockResponse();

      await userController.removeUserAddress(req, res, mockNext);

      expect(addressService.deleteAddressById).not.toHaveBeenCalled();
      expect(addressService.deleteAddressByConditions).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(StatusCodes.BAD_REQUEST);
      expect(mockNext).not.toHaveBeenCalled();
    });

    /**
     * TCQLDC14
     */
    it('TCQLDC14 - Xóa một địa chỉ thành công', async () => {
      (addressService.deleteAddressById as jest.Mock).mockResolvedValue([]);

      const req = createMockRequest({
        currentUser: MOCK_CURRENT_USER,
        query: { addressIds: '10' }
      });
      const res = createMockResponse();

      await userController.removeUserAddress(req, res, mockNext);

      expect(addressService.deleteAddressById).toHaveBeenCalledWith(10);
      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(mockNext).not.toHaveBeenCalled();
    });

    /**
     * TCQLDC15
     */
    it('TCQLDC15 - Xóa nhiều địa chỉ thành công', async () => {
      (addressService.deleteAddressByConditions as jest.Mock).mockResolvedValue([]);

      const req = createMockRequest({
        currentUser: MOCK_CURRENT_USER,
        query: { addressIds: ['10', '11'] }
      });
      const res = createMockResponse();

      await userController.removeUserAddress(req, res, mockNext);

      expect(addressService.deleteAddressByConditions).toHaveBeenCalledWith({
        id: { operator: 'in', value: [10, 11] },
        userId: { operator: 'eq', value: 1 }
      });
      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(mockNext).not.toHaveBeenCalled();
    });

    /**
     * TCQLDC16
     */
    it('TCQLDC16 - Goi next(error) khi deleteAddressById throw exception', async () => {
      const mockError = new Error('Database delete failed');
      (addressService.deleteAddressById as jest.Mock).mockRejectedValue(mockError);

      const req = createMockRequest({
        currentUser: MOCK_CURRENT_USER,
        query: { addressIds: '10' }
      });
      const res = createMockResponse();

      await userController.removeUserAddress(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(mockError);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    /**
     * TCQLDC17
     */
    it('TCQLDC17 - Goi next(error) khi deleteAddressByConditions throw exception', async () => {
      const mockError = new Error('Database delete failed');
      (addressService.deleteAddressByConditions as jest.Mock).mockRejectedValue(mockError);

      const req = createMockRequest({
        currentUser: MOCK_CURRENT_USER,
        query: { addressIds: ['10', '11'] }
      });
      const res = createMockResponse();

      await userController.removeUserAddress(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(mockError);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    /**
     * TCQLDC18
     */
    it('TCQLDC18 - Trả về 400 khi addressIds không phải số hợp lệ', async () => {
      const req = createMockRequest({
        currentUser: MOCK_CURRENT_USER,
        query: { addressIds: 'abc' }
      });
      const res = createMockResponse();

      await userController.removeUserAddress(req, res, mockNext);

      expect(addressService.deleteAddressById).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: StatusCodes.BAD_REQUEST })
      );
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('getUserAddresses', () => {
    /**
     * TCQLDC19
     */
    it('TCQLDC19 - Lấy danh sách địa chỉ của user hiện tại', async () => {
      (addressService.searchAddressByConditions as jest.Mock).mockResolvedValue([MOCK_ADDRESS]);

      const req = createMockRequest({
        currentUser: MOCK_CURRENT_USER
      });
      const res = createMockResponse();

      await userController.getUserAddresses(req, res, mockNext);

      expect(addressService.searchAddressByConditions).toHaveBeenCalledWith({
        userId: { operator: 'eq', value: 1 }
      });
      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [MOCK_ADDRESS]
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    /**
     * TCQLDC20
     */
    it('TCQLDC20 - Trả về 200 với data rỗng khi user chưa có địa chỉ', async () => {
      (addressService.searchAddressByConditions as jest.Mock).mockResolvedValue([]);

      const req = createMockRequest({ currentUser: MOCK_CURRENT_USER });
      const res = createMockResponse();

      await userController.getUserAddresses(req, res, mockNext);

      expect(addressService.searchAddressByConditions).toHaveBeenCalledWith({
        userId: { operator: 'eq', value: 1 }
      });
      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ data: [] })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    /**
     * TCQLDC21
     */
    it('TCQLDC21 - Goi next(error) khi searchAddressByConditions throw exception', async () => {
      const mockError = new Error('Database query failed');
      (addressService.searchAddressByConditions as jest.Mock).mockRejectedValue(mockError);

      const req = createMockRequest({ currentUser: MOCK_CURRENT_USER });
      const res = createMockResponse();

      await userController.getUserAddresses(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(mockError);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });
  });

  describe('setDefaultAddress', () => {
    /**
     * TCQLDC22
     */
    it('TCQLDC22 - Gọi next(ApiError 400) khi thiếu addressId', async () => {
      const req = createMockRequest({
        currentUser: MOCK_CURRENT_USER,
        params: {}
      });
      const res = createMockResponse();

      await userController.setDefaultAddress(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: StatusCodes.BAD_REQUEST })
      );
      expect(res.status).not.toHaveBeenCalled();
    });

    /**
     * TCQLDC23
     */
    it('TCQLDC23 - Gọi next(ApiError 404) khi địa chỉ không tồn tại', async () => {
      (addressService.searchAddressByConditions as jest.Mock).mockResolvedValue([]);

      const req = createMockRequest({
        currentUser: MOCK_CURRENT_USER,
        params: { addressId: '10' }
      });
      const res = createMockResponse();

      await userController.setDefaultAddress(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: StatusCodes.NOT_FOUND })
      );
      expect(res.status).not.toHaveBeenCalled();
    });

    /**
     * TCQLDC24
     */
    it('TCQLDC24 - Đặt địa chỉ mặc định thành công', async () => {
      (addressService.searchAddressByConditions as jest.Mock).mockResolvedValue([MOCK_ADDRESS]);
      (addressService.updateAddressByConditions as jest.Mock).mockResolvedValue([]);

      const req = createMockRequest({
        currentUser: MOCK_CURRENT_USER,
        params: { addressId: '10' }
      });
      const res = createMockResponse();

      await userController.setDefaultAddress(req, res, mockNext);

      expect(addressService.updateAddressByConditions).toHaveBeenNthCalledWith(
        1,
        { isDefault: false },
        { userId: { operator: 'eq', value: 1 } }
      );
      expect(addressService.updateAddressByConditions).toHaveBeenNthCalledWith(
        2,
        { isDefault: true },
        { userId: { operator: 'eq', value: 1 }, id: { operator: 'eq', value: 10 } }
      );
      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(mockNext).not.toHaveBeenCalled();
    });

    /**
     * TCQLDC25
     */
    it('TCQLDC25 - Goi next(error) khi updateAddressByConditions lan 1 throw', async () => {
      const mockError = new Error('Database update failed');
      (addressService.searchAddressByConditions as jest.Mock).mockResolvedValue([MOCK_ADDRESS]);
      (addressService.updateAddressByConditions as jest.Mock).mockRejectedValue(mockError);

      const req = createMockRequest({
        currentUser: MOCK_CURRENT_USER,
        params: { addressId: '10' }
      });
      const res = createMockResponse();

      await userController.setDefaultAddress(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(mockError);
      expect(addressService.updateAddressByConditions).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    /**
     * TCQLDC26
     */
    it('TCQLDC26 - Goi next(error) khi updateAddressByConditions lan 2 throw', async () => {
      const mockError = new Error('Database update failed');
      (addressService.searchAddressByConditions as jest.Mock).mockResolvedValue([MOCK_ADDRESS]);
      (addressService.updateAddressByConditions as jest.Mock)
        .mockResolvedValueOnce([])
        .mockRejectedValueOnce(mockError);

      const req = createMockRequest({
        currentUser: MOCK_CURRENT_USER,
        params: { addressId: '10' }
      });
      const res = createMockResponse();

      await userController.setDefaultAddress(req, res, mockNext);

      expect(addressService.updateAddressByConditions).toHaveBeenCalledTimes(2);
      expect(mockNext).toHaveBeenCalledWith(mockError);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    /**
     * TCQLDC27
     */
    it('TCQLDC27 - Gọi next(ApiError 400) khi addressId không phải số hợp lệ', async () => {
      const req = createMockRequest({
        currentUser: MOCK_CURRENT_USER,
        params: { addressId: 'abc' }
      });
      const res = createMockResponse();

      await userController.setDefaultAddress(req, res, mockNext);

      expect(addressService.searchAddressByConditions).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: StatusCodes.BAD_REQUEST })
      );
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('getUserDefaultAddress', () => {
    /**
     * TCQLDC28
     */
    it('TCQLDC28 - Gọi next(ApiError 400) khi thiếu userId', async () => {
      const req = createMockRequest({ params: {} });
      const res = createMockResponse();

      await userController.getUserDefaultAddress(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: StatusCodes.BAD_REQUEST })
      );
      expect(res.status).not.toHaveBeenCalled();
    });

    /**
     * TCQLDC29
     */
    it('TCQLDC29 - Lấy địa chỉ mặc định thành công theo userId', async () => {
      (addressService.searchAddressByConditions as jest.Mock).mockResolvedValue([MOCK_ADDRESS]);

      const req = createMockRequest({ params: { userId: '1' } });
      const res = createMockResponse();

      await userController.getUserDefaultAddress(req, res, mockNext);

      expect(addressService.searchAddressByConditions).toHaveBeenCalledWith({
        userId: { operator: 'eq', value: 1 },
        isDefault: { operator: 'eq', value: true }
      });
      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: MOCK_ADDRESS
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    /**
     * TCQLDC30
     */
    it('TCQLDC30 - Trả về 200 với data null khi không có địa chỉ mặc định', async () => {
      (addressService.searchAddressByConditions as jest.Mock).mockResolvedValue([]);

      const req = createMockRequest({ params: { userId: '1' } });
      const res = createMockResponse();

      await userController.getUserDefaultAddress(req, res, mockNext);

      expect(addressService.searchAddressByConditions).toHaveBeenCalledWith({
        userId: { operator: 'eq', value: 1 },
        isDefault: { operator: 'eq', value: true }
      });
      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ data: null })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    /**
     * TCQLDC31
     */
    it('TCQLDC31 - Goi next(error) khi searchAddressByConditions throw exception', async () => {
      const mockError = new Error('Database query failed');
      (addressService.searchAddressByConditions as jest.Mock).mockRejectedValue(mockError);

      const req = createMockRequest({ params: { userId: '1' } });
      const res = createMockResponse();

      await userController.getUserDefaultAddress(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(mockError);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    /**
     * TCQLDC32
     */
    it('TCQLDC32 - Gọi next(ApiError 400) khi userId không phải số hợp lệ', async () => {
      const req = createMockRequest({ params: { userId: 'abc' } });
      const res = createMockResponse();

      await userController.getUserDefaultAddress(req, res, mockNext);

      expect(addressService.searchAddressByConditions).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: StatusCodes.BAD_REQUEST })
      );
      expect(res.status).not.toHaveBeenCalled();
    });
  });
});
