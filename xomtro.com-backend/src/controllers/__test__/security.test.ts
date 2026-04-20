/**
 * Unit test cho chức năng quản lý bảo mật tài khoản
 *
 * Bao gồm 3 chức năng:
 * 1. Đổi mật khẩu              → changeUserPassword      (user.controller.ts)
 * 2. Cập lại mật khẩu mặc định → getDefaultGooglePassword (auth.controller.ts)
 * 3. Tạm khoá tài khoản        → disableUser              (auth.controller.ts)
 *
 * Lưu ý về mock:
 * - Phải mock TẤT CẢ module mà controller import, kể cả gián tiếp,
 *   vì Jest sẽ thực thi toàn bộ import trước khi chạy test.
 * - user.controller.ts import auth.controller.ts nên cần mock cả auth.controller
 *   để tránh circular dependency khi load module.
 * - Dùng jest.isolateModules + require() để load file gốc auth.controller
 *   sau khi đã unmock, tránh lấy nhầm bản mock.
 */

// ─── Mock toàn bộ dependency của auth.controller.ts ──────────────────────────

jest.mock('../configs/axiosClient.config', () => ({
  default: { get: jest.fn(), post: jest.fn() }
}));

jest.mock('../configs/env.config', () => ({
  env: { GOOGLE_CLIENT_ID: 'fake-id', JWT_SECRET: 'fake-secret', JWT_REFRESH_SECRET: 'fake-refresh' }
}));

jest.mock('../configs/nodeMailer.config', () => ({
  transporter: { sendMail: jest.fn() }
}));

jest.mock('../services/asset.service', () => ({
  insertAsset: jest.fn(),
  selectAssetById: jest.fn(),
  selectAssetsByConditions: jest.fn(),
  updateAssetById: jest.fn()
}));

jest.mock('../services/fileUpload.service', () => ({
  uploadImageFromUrl: jest.fn(),
  uploadAvatar: jest.fn(),
  deleteResource: jest.fn()
}));

jest.mock('../services/post.service', () => ({
  updatePostByConditions: jest.fn()
}));

jest.mock('../services/token.service', () => ({
  insertToken: jest.fn(),
  removeTokenByCondition: jest.fn(),
  searchTokenByCondition: jest.fn()
}));

jest.mock('../services/user.service', () => ({
  insertUser: jest.fn(),
  insertUserDetail: jest.fn(),
  selectFullUserByConditions: jest.fn(),
  selectUserDetailByEmail: jest.fn(),
  selectUserDetailById: jest.fn(),
  updateUserById: jest.fn(),
  updateUserDetailById: jest.fn()
}));

jest.mock('../services/address.service', () => ({
  insertAddress: jest.fn(),
  selectAddressByUserId: jest.fn(),
  updateAddressById: jest.fn(),
  deleteAddressById: jest.fn(),
  selectDefaultAddressByUserId: jest.fn(),
  setDefaultAddress: jest.fn()
}));

jest.mock('../services/location.service', () => ({
  geocodingByGoong: jest.fn()
}));

jest.mock('../utils/constants.helper', () => ({
  generateRandomPassword: jest.fn(),
  cleanObject: jest.fn((obj: any) => obj),
  generateSlug: jest.fn()
}));

jest.mock('../utils/email.helper', () => ({
  generateEmailContent: jest.fn(() => '<html>email</html>'),
  generateVerifyEmailContent: jest.fn(() => '<html>verify</html>'),
  sendEmail: jest.fn()
}));

jest.mock('../utils/time.helper', () => ({
  timeInVietNam: jest.fn(() => new Date('2024-01-01T10:00:00')),
  formatTimeForVietnamese: jest.fn(() => '10:00:00 01/01/2024')
}));

jest.mock('../utils/token.helper', () => ({
  generateAccessToken: jest.fn(() => 'fake-access-token'),
  generateRefreshToken: jest.fn(() => 'fake-refresh-token'),
  generateOtpCode: jest.fn(() => '123456'),
  refreshExpirationTime: jest.fn(() => new Date('2099-01-01')),
  verifyJwtToken: jest.fn()
}));

jest.mock('../utils/file.helper', () => ({
  generateFileName: jest.fn(() => 'fake-file-name')
}));

jest.mock('../utils/ApiResponse.helper', () => ({
  ApiResponse: jest.fn().mockImplementation(() => ({ send: jest.fn() }))
}));

jest.mock('../utils/ApiError.helper', () => {
  return jest.fn().mockImplementation((status: number, message: string) => {
    const err: any = new Error(message);
    err.status = status;
    err.statusCode = status;
    return err;
  });
});

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn()
}));

// Mock auth.controller để user.controller load được (tránh vòng lặp dependency)
jest.mock('../controllers/auth.controller', () => ({
  handleUserTokenProcess: jest.fn(),
  disableUser: jest.fn(),
  getDefaultGooglePassword: jest.fn()
}));

// ─── Import sau khi mock xong ─────────────────────────────────────────────────

import { changeUserPassword } from '../controllers/user.controller';
import bcrypt from 'bcrypt';
import { updateUserById, updateUserDetailById } from '../services/user.service';
import { removeTokenByCondition } from '../services/token.service';
import { updatePostByConditions } from '../services/post.service';
import { generateRandomPassword } from '../utils/constants.helper';
import { generateEmailContent, sendEmail } from '../utils/email.helper';
import { Request, Response, NextFunction } from 'express';

// ─── Helper tạo mock request/response/next ────────────────────────────────────

/** Tạo mock Request với thông tin người dùng mặc định */
const taoRequest = (overrides: Partial<Request> = {}): Request =>
  ({
    body: {},
    params: {},
    query: {},
    currentUser: {
      users: {
        id: 1,
        password: '$2b$10$hashedpassword',
        status: 'actived',
        tokenVersion: 0
      },
      users_detail: {
        userId: 1,
        email: 'nguyenvana@gmail.com',
        firstName: 'Văn A',
        lastName: 'Nguyễn',
        role: 'tenant',
        isEmailVerified: true
      }
    },
    ...overrides
  } as unknown as Request);

const taoResponse = (): Response & { clearCookie: jest.Mock } => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.clearCookie = jest.fn();
  return res;
};

const mockNext: NextFunction = jest.fn();

// Ẩn console.log từ catch block trong controller
beforeAll(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
afterAll(() => jest.restoreAllMocks());

// ═════════════════════════════════════════════════════════════════════════════
// 1. ĐỔI MẬT KHẨU — changeUserPassword
// ═════════════════════════════════════════════════════════════════════════════
describe('changeUserPassword — Đổi mật khẩu', () => {
  beforeEach(() => jest.clearAllMocks());

  it('đổi mật khẩu thành công khi mật khẩu cũ đúng', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    (bcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$newhashedpassword');
    (updateUserById as jest.Mock).mockResolvedValue([]);

    const req = taoRequest({
      body: {
        oldPassword: 'MatKhauCu@123',
        newPassword: 'MatKhauMoi@456',
        confirmNewPassword: 'MatKhauMoi@456'
      }
    });
    const res = taoResponse();
    await changeUserPassword(req, res, mockNext);

    // Phải hash mật khẩu mới trước khi lưu
    expect(bcrypt.hash).toHaveBeenCalledWith('MatKhauMoi@456', 10);
    // Phải cập nhật mật khẩu mới vào DB
    expect(updateUserById).toHaveBeenCalledWith(1, { password: '$2b$10$newhashedpassword' });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('so sánh đúng mật khẩu người nhập với hash lưu trong DB', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    (bcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$hash');
    (updateUserById as jest.Mock).mockResolvedValue([]);

    const matKhauNhap = 'MatKhauNguoiDungNhap';
    const hashTrongDB = '$2b$10$hashedpassword';

    const req = taoRequest({
      body: { oldPassword: matKhauNhap, newPassword: 'moi', confirmNewPassword: 'moi' }
    });
    const res = taoResponse();
    await changeUserPassword(req, res, mockNext);

    // compare(mật khẩu nhập, hash trong DB) — kiểm tra đúng thứ tự tham số
    expect(bcrypt.compare).toHaveBeenCalledWith(matKhauNhap, hashTrongDB);
  });

  it('đổi mật khẩu thành công với ký tự đặc biệt', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    (bcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$complexhash');
    (updateUserById as jest.Mock).mockResolvedValue([]);

    const req = taoRequest({
      body: { oldPassword: 'OldP@ss!123', newPassword: 'N3wP@ss!^&*', confirmNewPassword: 'N3wP@ss!^&*' }
    });
    const res = taoResponse();
    await changeUserPassword(req, res, mockNext);

    expect(updateUserById).toHaveBeenCalledWith(1, { password: '$2b$10$complexhash' });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('trả về 400 và không cập nhật DB khi mật khẩu cũ sai', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    const req = taoRequest({
      body: { oldPassword: 'SaiMatKhau', newPassword: 'MatKhauMoi@456', confirmNewPassword: 'MatKhauMoi@456' }
    });
    const res = taoResponse();
    await changeUserPassword(req, res, mockNext);

    // Không được hash hay lưu DB khi mật khẩu cũ sai
    expect(bcrypt.hash).not.toHaveBeenCalled();
    expect(updateUserById).not.toHaveBeenCalled();
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('gọi next(error) khi bcrypt.compare ném lỗi', async () => {
    (bcrypt.compare as jest.Mock).mockRejectedValue(new Error('Lỗi bcrypt'));

    const req = taoRequest({ body: { oldPassword: 'bat_ky', newPassword: 'moi', confirmNewPassword: 'moi' } });
    const res = taoResponse();
    await changeUserPassword(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
  });

  it('gọi next(error) khi updateUserById thất bại', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    (bcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$hash');
    (updateUserById as jest.Mock).mockRejectedValue(new Error('Lỗi DB'));

    const req = taoRequest({ body: { oldPassword: 'dung', newPassword: 'moi', confirmNewPassword: 'moi' } });
    const res = taoResponse();
    await changeUserPassword(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
  });
  it('trả về 400 khi mật khẩu mới và xác nhận không khớp', async () => {
    const req = taoRequest({
      body: { 
        oldPassword: 'MatKhauCu@123', 
        newPassword: 'Password123', 
        confirmNewPassword: 'KhacHoanToan123' 
      }
    });
    const res = taoResponse();
    await changeUserPassword(req, res, mockNext);

    expect(updateUserById).not.toHaveBeenCalled();
    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
});
it('trả về 400 khi mật khẩu mới trùng với mật khẩu cũ', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValue(true); // Giả lập bcrypt thấy pass mới = pass cũ

    const req = taoRequest({
      body: { 
        oldPassword: 'Password123', 
        newPassword: 'Password123', 
        confirmNewPassword: 'Password123' 
      }
    });
    const res = taoResponse();
    await changeUserPassword(req, res, mockNext);

    // Mong đợi: Phải báo lỗi 400 vì không có gì thay đổi
    expect(updateUserById).not.toHaveBeenCalled();
    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
});
it('trả về 400 khi mật khẩu mới quá ngắn', async () => {
    const req = taoRequest({
      body: { 
        oldPassword: 'MatKhauCu@123', 
        newPassword: '123', 
        confirmNewPassword: '123' 
      }
    });
    const res = taoResponse();
    await changeUserPassword(req, res, mockNext);

    expect(updateUserById).not.toHaveBeenCalled();
    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
});
it('trả về 400 khi thiếu một trong các trường bắt buộc', async () => {
    const req = taoRequest({
      body: { oldPassword: 'MatKhauCu@123' } // Thiếu pass mới và confirm
    });
    const res = taoResponse();
    await changeUserPassword(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
});
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. CẬP LẠI MẬT KHẨU MẶC ĐỊNH — getDefaultGooglePassword
// Dùng jest.isolateModules để load file gốc auth.controller (không qua mock)
// ═════════════════════════════════════════════════════════════════════════════
describe('getDefaultGooglePassword — Cập lại mật khẩu mặc định (Google)', () => {
  let getDefaultGooglePassword: Function;

  beforeAll(() => {
    jest.unmock('../controllers/auth.controller');
    jest.isolateModules(() => {
      ({ getDefaultGooglePassword } = require('../controllers/auth.controller'));
    });
  });

  beforeEach(() => jest.clearAllMocks());

  it('sinh mật khẩu ngẫu nhiên với prefix "google"', async () => {
    (generateRandomPassword as jest.Mock).mockReturnValue('googleAbc123');
    (bcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$googlehash');
    (updateUserById as jest.Mock).mockResolvedValue([]);
    (generateEmailContent as jest.Mock).mockReturnValue('<html></html>');
    (sendEmail as jest.Mock).mockResolvedValue(undefined);

    const req = taoRequest();
    const res = taoResponse();
    await getDefaultGooglePassword(req, res, mockNext);

    expect(generateRandomPassword).toHaveBeenCalledWith(6, true, true, true, { prefix: 'google' });
  });

  it('hash mật khẩu mới và lưu vào DB đúng user', async () => {
    const matKhauMoi = 'googleXyz789';
    (generateRandomPassword as jest.Mock).mockReturnValue(matKhauMoi);
    (bcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$googlehash');
    (updateUserById as jest.Mock).mockResolvedValue([]);
    (generateEmailContent as jest.Mock).mockReturnValue('<html></html>');
    (sendEmail as jest.Mock).mockResolvedValue(undefined);

    const req = taoRequest();
    const res = taoResponse();
    await getDefaultGooglePassword(req, res, mockNext);

    expect(bcrypt.hash).toHaveBeenCalledWith(matKhauMoi, 10);
    expect(updateUserById).toHaveBeenCalledWith(1, { password: '$2b$10$googlehash' });
  });

  it('gửi email thông báo đến đúng địa chỉ của người dùng', async () => {
    (generateRandomPassword as jest.Mock).mockReturnValue('googlePass');
    (bcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$hash');
    (updateUserById as jest.Mock).mockResolvedValue([]);
    (generateEmailContent as jest.Mock).mockReturnValue('<html></html>');
    (sendEmail as jest.Mock).mockResolvedValue(undefined);

    const req = taoRequest();
    const res = taoResponse();
    await getDefaultGooglePassword(req, res, mockNext);

    expect(sendEmail).toHaveBeenCalledWith('nguyenvana@gmail.com', 'Thay đổi mật khẩu', expect.any(String));
  });

  it('nội dung email chứa tên đầy đủ của người dùng', async () => {
    (generateRandomPassword as jest.Mock).mockReturnValue('googlePass99');
    (bcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$hash');
    (updateUserById as jest.Mock).mockResolvedValue([]);
    (generateEmailContent as jest.Mock).mockReturnValue('<html></html>');
    (sendEmail as jest.Mock).mockResolvedValue(undefined);

    const req = taoRequest();
    const res = taoResponse();
    await getDefaultGooglePassword(req, res, mockNext);

    expect(generateEmailContent).toHaveBeenCalledWith(
      'Văn A Nguyễn',
      expect.objectContaining({ headerText: 'Thay đổi mật khẩu' })
    );
  });

  it('gọi next(error) khi updateUserById thất bại — không gửi email', async () => {
    (generateRandomPassword as jest.Mock).mockReturnValue('googleFail');
    (bcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$hash');
    (updateUserById as jest.Mock).mockRejectedValue(new Error('Lỗi DB'));

    const req = taoRequest();
    const res = taoResponse();
    await getDefaultGooglePassword(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('gọi next(error) khi sendEmail thất bại', async () => {
    (generateRandomPassword as jest.Mock).mockReturnValue('googleOk');
    (bcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$hash');
    (updateUserById as jest.Mock).mockResolvedValue([]);
    (generateEmailContent as jest.Mock).mockReturnValue('<html></html>');
    (sendEmail as jest.Mock).mockRejectedValue(new Error('Không gửi được email'));

    const req = taoRequest();
    const res = taoResponse();
    await getDefaultGooglePassword(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
  });

  it('gọi next(error) khi bcrypt.hash thất bại — không gọi DB, không gửi email', async () => {
    (generateRandomPassword as jest.Mock).mockReturnValue('googleOk');
    (bcrypt.hash as jest.Mock).mockRejectedValue(new Error('bcrypt lỗi'));

    const req = taoRequest();
    const res = taoResponse();
    await getDefaultGooglePassword(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    expect(updateUserById).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });
  it('đảm bảo mật khẩu gửi trong email trùng với mật khẩu đã hash', async () => {
    const matKhauSinhRa = 'googleSecure123';
    (generateRandomPassword as jest.Mock).mockReturnValue(matKhauSinhRa);
    (bcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$hash');
    (updateUserById as jest.Mock).mockResolvedValue([]);
    (generateEmailContent as jest.Mock).mockReturnValue('<html></html>');
    (sendEmail as jest.Mock).mockResolvedValue(undefined);

    const req = taoRequest();
    const res = taoResponse();
    await getDefaultGooglePassword(req, res, mockNext);

    // Sửa mainText thành bodyText theo đúng thực tế log nhận được
    expect(generateEmailContent).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ 
        bodyText: expect.stringContaining(matKhauSinhRa) 
      })
    );
});

it('trả về 200 và thông báo thành công khi hoàn tất mọi bước', async () => {
    (generateRandomPassword as jest.Mock).mockReturnValue('googlePass');
    (bcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$hash');
    (updateUserById as jest.Mock).mockResolvedValue([]);
    (generateEmailContent as jest.Mock).mockReturnValue('<html></html>');
    (sendEmail as jest.Mock).mockResolvedValue(undefined);

    const req = taoRequest();
    const res = taoResponse();
    
    // Đảm bảo mock cả status và json một cách liền mạch
    const jsonMock = jest.fn();
    res.status = jest.fn().mockReturnValue({ json: jsonMock });

    await getDefaultGooglePassword(req, res, mockNext);

    // Kiểm tra xem controller có gọi trả về cho client không
    expect(res.status).toHaveBeenCalledWith(200);
    expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.any(String)
    }));
});
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. TẠM KHOÁ TÀI KHOẢN — disableUser
// ═════════════════════════════════════════════════════════════════════════════
describe('disableUser — Tạm khoá tài khoản', () => {
  let disableUser: Function;

  beforeAll(() => {
    jest.unmock('../controllers/auth.controller');
    jest.isolateModules(() => {
      ({ disableUser } = require('../controllers/auth.controller'));
    });
  });

  beforeEach(() => jest.clearAllMocks());

  it('đổi status tài khoản thành "unactived"', async () => {
    (updateUserById as jest.Mock).mockResolvedValue([]);
    (updateUserDetailById as jest.Mock).mockResolvedValue([]);
    (updatePostByConditions as jest.Mock).mockResolvedValue([]);
    (removeTokenByCondition as jest.Mock).mockResolvedValue([]);

    const req = taoRequest();
    const res = taoResponse();
    await disableUser(req, res, mockNext);

    expect(updateUserById).toHaveBeenCalledWith(1, {
      status: 'unactived',
      tokenVersion: 1 // tokenVersion cũ = 0, tăng lên 1
    });
  });

  it('huỷ xác thực email — đặt isEmailVerified = false', async () => {
    (updateUserById as jest.Mock).mockResolvedValue([]);
    (updateUserDetailById as jest.Mock).mockResolvedValue([]);
    (updatePostByConditions as jest.Mock).mockResolvedValue([]);
    (removeTokenByCondition as jest.Mock).mockResolvedValue([]);

    const req = taoRequest();
    const res = taoResponse();
    await disableUser(req, res, mockNext);

    expect(updateUserDetailById).toHaveBeenCalledWith(1, { isEmailVerified: false });
  });

  it('ẩn toàn bộ bài đăng của người dùng', async () => {
    (updateUserById as jest.Mock).mockResolvedValue([]);
    (updateUserDetailById as jest.Mock).mockResolvedValue([]);
    (updatePostByConditions as jest.Mock).mockResolvedValue([]);
    (removeTokenByCondition as jest.Mock).mockResolvedValue([]);

    const req = taoRequest();
    const res = taoResponse();
    await disableUser(req, res, mockNext);

    expect(updatePostByConditions).toHaveBeenCalledWith(
      { status: 'unactived' },
      { ownerId: { operator: 'eq', value: 1 } }
    );
  });

  it('xoá toàn bộ token — đăng xuất khỏi mọi thiết bị', async () => {
    (updateUserById as jest.Mock).mockResolvedValue([]);
    (updateUserDetailById as jest.Mock).mockResolvedValue([]);
    (updatePostByConditions as jest.Mock).mockResolvedValue([]);
    (removeTokenByCondition as jest.Mock).mockResolvedValue([]);

    const req = taoRequest();
    const res = taoResponse();
    await disableUser(req, res, mockNext);

    expect(removeTokenByCondition).toHaveBeenCalledWith({ userId: 1 });
  });

  it('xoá cookie refreshToken trên trình duyệt', async () => {
    (updateUserById as jest.Mock).mockResolvedValue([]);
    (updateUserDetailById as jest.Mock).mockResolvedValue([]);
    (updatePostByConditions as jest.Mock).mockResolvedValue([]);
    (removeTokenByCondition as jest.Mock).mockResolvedValue([]);

    const req = taoRequest();
    const res = taoResponse();
    await disableUser(req, res, mockNext);

    expect(res.clearCookie).toHaveBeenCalledWith('refreshToken');
  });

  it('thực hiện đủ cả 4 thao tác và không gọi next khi thành công', async () => {
    (updateUserById as jest.Mock).mockResolvedValue([]);
    (updateUserDetailById as jest.Mock).mockResolvedValue([]);
    (updatePostByConditions as jest.Mock).mockResolvedValue([]);
    (removeTokenByCondition as jest.Mock).mockResolvedValue([]);

    const req = taoRequest();
    const res = taoResponse();
    await disableUser(req, res, mockNext);

    expect(updateUserById).toHaveBeenCalledTimes(1);
    expect(updateUserDetailById).toHaveBeenCalledTimes(1);
    expect(updatePostByConditions).toHaveBeenCalledTimes(1);
    expect(removeTokenByCondition).toHaveBeenCalledTimes(1);
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('tăng tokenVersion đúng từ giá trị hiện tại (5 → 6)', async () => {
    (updateUserById as jest.Mock).mockResolvedValue([]);
    (updateUserDetailById as jest.Mock).mockResolvedValue([]);
    (updatePostByConditions as jest.Mock).mockResolvedValue([]);
    (removeTokenByCondition as jest.Mock).mockResolvedValue([]);

    const req = taoRequest({
      currentUser: {
        users: { id: 1, password: 'hash', status: 'actived', tokenVersion: 5 },
        users_detail: { userId: 1, email: 'test@gmail.com', firstName: 'A', lastName: 'B', isEmailVerified: true }
      }
    });
    const res = taoResponse();
    await disableUser(req, res, mockNext);

    expect(updateUserById).toHaveBeenCalledWith(1, { status: 'unactived', tokenVersion: 6 });
  });

  it('gọi next(error) khi updateUserById thất bại', async () => {
    (updateUserById as jest.Mock).mockRejectedValue(new Error('Lỗi DB'));
    (updateUserDetailById as jest.Mock).mockResolvedValue([]);
    (updatePostByConditions as jest.Mock).mockResolvedValue([]);
    (removeTokenByCondition as jest.Mock).mockResolvedValue([]);

    const req = taoRequest();
    const res = taoResponse();
    await disableUser(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
  });

  it('gọi next(error) khi removeTokenByCondition thất bại — không clear cookie', async () => {
    (updateUserById as jest.Mock).mockResolvedValue([]);
    (updateUserDetailById as jest.Mock).mockResolvedValue([]);
    (updatePostByConditions as jest.Mock).mockResolvedValue([]);
    (removeTokenByCondition as jest.Mock).mockRejectedValue(new Error('Lỗi xoá token'));

    const req = taoRequest();
    const res = taoResponse();
    await disableUser(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    expect(res.clearCookie).not.toHaveBeenCalled();
  });

  it('gọi next(error) khi updatePostByConditions thất bại', async () => {
    (updateUserById as jest.Mock).mockResolvedValue([]);
    (updateUserDetailById as jest.Mock).mockResolvedValue([]);
    (updatePostByConditions as jest.Mock).mockRejectedValue(new Error('Lỗi cập nhật bài viết'));
    (removeTokenByCondition as jest.Mock).mockResolvedValue([]);

    const req = taoRequest();
    const res = taoResponse();
    await disableUser(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
  });
});