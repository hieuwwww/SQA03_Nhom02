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
ApiResponse: jest.fn().mockImplementation((statusCode, message, data) => ({
  send: jest.fn().mockImplementation((res) => {
    res.status(statusCode);
    res.json({ statusCode, message, data }); // Trả về cả data nếu có
    return res;
  })
}))
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

const taoResponse = () => {
  const res: any = {};
  // Mock tất cả các hàm trả về chính res
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res); 
  res.clearCookie = jest.fn().mockReturnValue(res);
  // Thêm cookie nếu cần
  res.cookie = jest.fn().mockReturnValue(res);
  return res as Response & { status: jest.Mock; json: jest.Mock; send: jest.Mock; clearCookie: jest.Mock };
};


// Ẩn console.log từ catch block trong controller
beforeAll(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
afterAll(() => jest.restoreAllMocks());
const mockNext = jest.fn() as unknown as NextFunction & jest.Mock;
// ═════════════════════════════════════════════════════════════════════════════
// 1. ĐỔI MẬT KHẨU — changeUserPassword
// ═════════════════════════════════════════════════════════════════════════════
describe('changeUserPassword — Đổi mật khẩu', () => {
  beforeEach(() => jest.clearAllMocks());

  it('TCQLBMTK1 :Đổi mật khẩu thành công khi mật khẩu cũ đúng', async () => {
    // 1. Setup Mock
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    (bcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$newhashedpassword');
    (updateUserById as jest.Mock).mockResolvedValue([ { affectedRows: 1 } ]); // Giả lập DB update thành công

    const req = taoRequest({
      body: {
        oldPassword: 'MatKhauCu@123',
        newPassword: 'MatKhauMoi@456',
        confirmNewPassword: 'MatKhauMoi@456'
      }
    });
    const res = taoResponse();

    // 2. Thực thi
    await changeUserPassword(req, res, mockNext);

    // 3. Kiểm tra logic nghiệp vụ
    expect(bcrypt.compare).toHaveBeenCalledWith('MatKhauCu@123', expect.any(String));
    expect(bcrypt.hash).toHaveBeenCalledWith('MatKhauMoi@456', 10);
    expect(updateUserById).toHaveBeenCalledWith(1, { password: '$2b$10$newhashedpassword' });

    // 4. KIỂM TRA PHẢN HỒI (Khớp với ApiResponse.send(res))
    // Thông thường StatusCodes.OK là 200
    expect(res.status).toHaveBeenCalledWith(200); 
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Change password successfully!'
    }));

    // Đảm bảo không nhảy vào catch (next(error))
    expect(mockNext).not.toHaveBeenCalled();
});

  it('TCQLBMTK2 :So sánh đúng mật khẩu người nhập với hash lưu trong DB', async () => {
    const matKhauNhap = 'MatKhauNguoiDungNhap';
    const hashTrongDB = '$2b$10$hashedpassword_that_exists_in_db';

    // Mock các hàm bcrypt và service
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    (bcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$new_hash');
    (updateUserById as jest.Mock).mockResolvedValue([]);

    // QUAN TRỌNG: Gán hashTrongDB vào currentUser để controller lấy ra dùng
    const req = taoRequest({
      body: { 
        oldPassword: matKhauNhap, 
        newPassword: 'MatKhauMoi@123', 
        confirmNewPassword: 'MatKhauMoi@123' 
      },
      currentUser: {
        users: {
          id: 1,
          password: hashTrongDB // Controller sẽ bóc tách giá trị này ở đây
        }
      }as any,
    });
    
    const res = taoResponse();
    await changeUserPassword(req, res, mockNext);

    // Kiểm tra: compare(mật khẩu nhập vào, mật khẩu lấy từ DB ra)
    expect(bcrypt.compare).toHaveBeenCalledWith(matKhauNhap, hashTrongDB);
    
    // Kiểm tra thêm status để đảm bảo tính toàn vẹn
    expect(res.status).toHaveBeenCalledWith(200);
  });

it('TCQLBMTK3 :trả về 400 nếu mật khẩu mới quá ngắn (< 6 ký tự)', async () => {
  // 1. Phải giả lập pass cũ ĐÚNG để code chạy qua được trạm kiểm soát đầu tiên
  (bcrypt.compare as jest.Mock).mockResolvedValue(true);

  const req = taoRequest({
    currentUser: { users: { id: 1, password: 'hashed_password' } } as any, // Đừng quên currentUser!
    body: { 
      oldPassword: 'ValidOld123!', 
      newPassword: '12345', 
      confirmNewPassword: '12345' 
    }
  });
  
  const res = taoResponse();

  await changeUserPassword(req, res, mockNext);

  // 2. Kiểm tra: Không được gọi xuống DB để lưu pass yếu
  expect(updateUserById).not.toHaveBeenCalled();

  // 3. SỬA Ở ĐÂY: Kiểm tra status code thông qua res.status
  // Vì cái mock ApiResponse của mình đã nối ống vào res.status rồi
  expect(res.status).toHaveBeenCalledWith(400);
});

// --- TIẾP TỤC TỪ TCQLBMTK5 ---

  it('TCQLBMTK4 :trả về 400 nếu mật khẩu mới thiếu chữ số', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    const req = taoRequest({
      body: { oldPassword: 'ValidOld123!', newPassword: 'NoNumber!', confirmNewPassword: 'NoNumber!' }
    });
    const res = taoResponse();

    await changeUserPassword(req, res, mockNext);

    expect(updateUserById).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('TCQLBMTK5 :trả về 400 nếu mật khẩu mới thiếu chữ in hoa', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    const req = taoRequest({
      body: { oldPassword: 'ValidOld123!', newPassword: 'lowercase1!', confirmNewPassword: 'lowercase1!' }
    });
    const res = taoResponse();

    await changeUserPassword(req, res, mockNext);

    expect(updateUserById).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('TCQLBMTK6 :trả về 400 nếu mật khẩu mới thiếu ký tự đặc biệt', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    const req = taoRequest({
      body: { oldPassword: 'ValidOld123!', newPassword: 'OnlyUppercase123', confirmNewPassword: 'OnlyUppercase123' }
    });
    const res = taoResponse();

    await changeUserPassword(req, res, mockNext);

    expect(updateUserById).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('TCQLBMTK7 :trả về 400 và không cập nhật DB khi mật khẩu cũ sai', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    const req = taoRequest({
      body: { oldPassword: 'SaiMatKhau', newPassword: 'MatKhauMoi@456', confirmNewPassword: 'MatKhauMoi@456' }
    });
    const res = taoResponse();

    await changeUserPassword(req, res, mockNext);

    expect(bcrypt.hash).not.toHaveBeenCalled();
    expect(updateUserById).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('TCQLBMTK8 :gọi next(error) khi bcrypt.compare ném lỗi', async () => {
    (bcrypt.compare as jest.Mock).mockRejectedValue(new Error('Lỗi bcrypt'));

    const req = taoRequest({ body: { oldPassword: 'bat_ky', newPassword: 'moi', confirmNewPassword: 'moi' } });
    const res = taoResponse();

    await changeUserPassword(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
  });

  it('TCQLBMTK9 :gọi next(error) khi updateUserById thất bại', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    (bcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$hash');
    (updateUserById as jest.Mock).mockRejectedValue(new Error('Lỗi DB'));

    const req = taoRequest({ body: { oldPassword: 'dung', newPassword: 'moi', confirmNewPassword: 'moi' } });
    const res = taoResponse();

    await changeUserPassword(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
  });

  it('TCQLBMTK10 :trả về 400 khi mật khẩu mới và xác nhận không khớp', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    const req = taoRequest({
      body: { 
        oldPassword: 'MatKhauCu@123', 
        newPassword: 'Password123!', 
        confirmNewPassword: 'KhacHoanToan123' 
      }
    });
    const res = taoResponse();

    await changeUserPassword(req, res, mockNext);

    expect(updateUserById).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('TCQLBMTK11 :trả về 400 khi mật khẩu mới trùng với mật khẩu cũ', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValue(true); 

    const req = taoRequest({
      body: { 
        oldPassword: 'Password123!', 
        newPassword: 'Password123!', 
        confirmNewPassword: 'Password123!' 
      }
    });
    const res = taoResponse();

    await changeUserPassword(req, res, mockNext);

    expect(updateUserById).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('TCQLBMTK12 :trả về 400 khi mật khẩu mới quá ngắn', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
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
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('TCQLBMTK13 :trả về 400 khi thiếu một trong các trường bắt buộc', async () => {
    const req = taoRequest({
      body: { oldPassword: 'MatKhauCu@123' } // Thiếu newPassword
    });
    const res = taoResponse();

    await changeUserPassword(req, res, mockNext);

    // Lưu ý: Case này code có thể crash gọi next(error) nếu không được validate body
    // Nhưng về mặt logic nghiệp vụ, ta mong đợi trả về 400
    expect(res.status).toHaveBeenCalledWith(422);
  });
});

describe('getDefaultGooglePassword — Cấp lại mật khẩu mặc định (Google)', () => {
  let getDefaultGooglePassword: Function;

  beforeAll(() => {
    jest.unmock('../controllers/auth.controller');
    jest.isolateModules(() => {
      ({ getDefaultGooglePassword } = require('../controllers/auth.controller'));
    });
  });

  beforeEach(() => jest.clearAllMocks());

  it('TCQLBMTK14 :sinh mật khẩu ngẫu nhiên với cấu hình prefix "google"', async () => {
    (generateRandomPassword as jest.Mock).mockReturnValue('googleAbc123');
    (bcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$hash');
    (updateUserById as jest.Mock).mockResolvedValue([1]);
    (sendEmail as jest.Mock).mockResolvedValue(undefined);

    const req = taoRequest();
    const res = taoResponse();
    await getDefaultGooglePassword(req, res, mockNext);

    expect(generateRandomPassword).toHaveBeenCalledWith(6, true, true, true, { prefix: 'google' });
  });

  it('TCQLBMTK15 :hash mật khẩu mới và lưu vào DB đúng userId', async () => {
    const matKhauMoi = 'googleXyz789';
    const hashedPass = '$2b$10$googlehash';
    (generateRandomPassword as jest.Mock).mockReturnValue(matKhauMoi);
    (bcrypt.hash as jest.Mock).mockResolvedValue(hashedPass);
    (updateUserById as jest.Mock).mockResolvedValue([1]);

    const req = taoRequest();
    const res = taoResponse();
    await getDefaultGooglePassword(req, res, mockNext);

    expect(bcrypt.hash).toHaveBeenCalledWith(matKhauMoi, 10);
    expect(updateUserById).toHaveBeenCalledWith(1, { password: hashedPass });
  });

  it('TCQLBMTK16 :gửi email thông báo đến đúng địa chỉ của người dùng', async () => {
    (generateRandomPassword as jest.Mock).mockReturnValue('googlePass');
    (bcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$hash');
    (updateUserById as jest.Mock).mockResolvedValue([1]);
    (generateEmailContent as jest.Mock).mockReturnValue('<html>Email</html>');
    (sendEmail as jest.Mock).mockResolvedValue(undefined);

    const req = taoRequest();
    const res = taoResponse();
    await getDefaultGooglePassword(req, res, mockNext);

    expect(sendEmail).toHaveBeenCalledWith('nguyenvana@gmail.com', 'Thay đổi mật khẩu', '<html>Email</html>');
  });

  it('TCQLBMTK17 :nội dung email chứa tên đầy đủ của người dùng', async () => {
    (generateRandomPassword as jest.Mock).mockReturnValue('googlePass99');
    (bcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$hash');
    (updateUserById as jest.Mock).mockResolvedValue([1]);
    (generateEmailContent as jest.Mock).mockReturnValue('<html></html>');

    const req = taoRequest(); 
    const res = taoResponse();
    await getDefaultGooglePassword(req, res, mockNext);

    expect(generateEmailContent).toHaveBeenCalledWith(
      'Văn A Nguyễn',
      expect.objectContaining({ headerText: 'Thay đổi mật khẩu' })
    );
  });

  it('TCQLBMTK18 :gọi next(error) khi updateUserById thất bại — không gửi email', async () => {
    (generateRandomPassword as jest.Mock).mockReturnValue('googleFail');
    (bcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$hash');
    (updateUserById as jest.Mock).mockRejectedValue(new Error('Lỗi DB'));

    const req = taoRequest();
    const res = taoResponse();
    await getDefaultGooglePassword(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('TCQLBMTK19 :gọi next(error) khi sendEmail thất bại', async () => {
    (generateRandomPassword as jest.Mock).mockReturnValue('googleOk');
    (bcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$hash');
    (updateUserById as jest.Mock).mockResolvedValue([1]);
    (sendEmail as jest.Mock).mockRejectedValue(new Error('Lỗi SMTP'));

    const req = taoRequest();
    const res = taoResponse();
    await getDefaultGooglePassword(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
  });

  it('TCQLBMTK20 :gọi next(error) khi bcrypt.hash thất bại — không gọi DB, không gửi email', async () => {
    (generateRandomPassword as jest.Mock).mockReturnValue('googleOk');
    (bcrypt.hash as jest.Mock).mockRejectedValue(new Error('bcrypt lỗi'));

    const req = taoRequest();
    const res = taoResponse();
    await getDefaultGooglePassword(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    expect(updateUserById).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('TCQLBMTK21 :đảm bảo mật khẩu gửi trong email trùng với mật khẩu đã sinh ra', async () => {
    const matKhauSinhRa = 'googleSecure123';
    (generateRandomPassword as jest.Mock).mockReturnValue(matKhauSinhRa);
    (bcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$hash');
    (updateUserById as jest.Mock).mockResolvedValue([1]);
    (generateEmailContent as jest.Mock).mockReturnValue('<html></html>');

    const req = taoRequest();
    const res = taoResponse();
    await getDefaultGooglePassword(req, res, mockNext);

    expect(generateEmailContent).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ 
        bodyText: expect.stringContaining(matKhauSinhRa) 
      })
    );
  });

  it('TCQLBMTK22 :trả về 200 và thông báo thành công khi hoàn tất mọi bước', async () => {
    (generateRandomPassword as jest.Mock).mockReturnValue('googlePass');
    (bcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$hash');
    (updateUserById as jest.Mock).mockResolvedValue([1]);
    (sendEmail as jest.Mock).mockResolvedValue(undefined);

    const req = taoRequest();
    const res = taoResponse();
    await getDefaultGooglePassword(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(200);
  });
  it('TCQLBMTK23 :gọi next(error) khi currentUser không tồn tại (lỗi bóc tách dữ liệu)', async () => {
    // Giả lập tình huống currentUser bị undefined (có thể do lỗi middleware Auth)
    const req = {
      currentUser: undefined
    } as unknown as Request;
    const res = taoResponse();

    await getDefaultGooglePassword(req, res, mockNext);

    // Khi currentUser undefined, dòng bóc tách { users_detail } = currentUser! sẽ văng lỗi
    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    // Đảm bảo không chạy tiếp xuống các bước dưới
    expect(updateUserById).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('TCQLBMTK24 :gọi next(error) khi email của người dùng bị thiếu (null)', async () => {
    const req = taoRequest();
    
    // Thêm dấu ! sau currentUser để khẳng định nó không undefined
    req.currentUser!.users_detail.email = null as any;

    const res = taoResponse();

    (generateRandomPassword as jest.Mock).mockReturnValue('googlePass');
    (bcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$hash');
    (updateUserById as jest.Mock).mockResolvedValue([1]);
    (sendEmail as jest.Mock).mockRejectedValue(new Error('Email is required'));

    await getDefaultGooglePassword(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
  });
});


describe('disableUser — Tạm khoá tài khoản', () => {
  let disableUser: Function;

  beforeAll(() => {
    jest.unmock('../controllers/auth.controller');
    jest.isolateModules(() => {
      ({ disableUser } = require('../controllers/auth.controller'));
    });
  });

  // Tạo một hàm helper để mock nhanh, đỡ phải viết đi viết lại 4 dòng
  const mockAllSuccess = () => {
    (updateUserById as jest.Mock).mockResolvedValue([1]);
    (updateUserDetailById as jest.Mock).mockResolvedValue([1]);
    (updatePostByConditions as jest.Mock).mockResolvedValue([1]);
    (removeTokenByCondition as jest.Mock).mockResolvedValue(1);
  };

  beforeEach(() => jest.clearAllMocks());

  it('TCQLBMTK25 :đổi status tài khoản thành "unactived" và tăng version', async () => {
    mockAllSuccess();
    const req = taoRequest(); 
    const res = taoResponse();
    await disableUser(req, res, mockNext);

    expect(updateUserById).toHaveBeenCalledWith(1, {
      status: 'unactived',
      tokenVersion: 1
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('TCQLBMTK26 :huỷ xác thực email — đặt isEmailVerified = false', async () => {
    mockAllSuccess();
    const req = taoRequest();
    const res = taoResponse();
    await disableUser(req, res, mockNext);

    expect(updateUserDetailById).toHaveBeenCalledWith(1, { isEmailVerified: false });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('TCQLBMTK27 :ẩn toàn bộ bài đăng của người dùng', async () => {
    mockAllSuccess(); // <--- Cần thêm
    const req = taoRequest();
    const res = taoResponse();
    await disableUser(req, res, mockNext);

    expect(updatePostByConditions).toHaveBeenCalledWith(
      { status: 'unactived' },
      { ownerId: { operator: 'eq', value: 1 } }
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('TCQLBMTK28 :xoá toàn bộ token — đăng xuất khỏi mọi thiết bị', async () => {
    mockAllSuccess(); 
    const req = taoRequest();
    const res = taoResponse();
    await disableUser(req, res, mockNext);

    expect(removeTokenByCondition).toHaveBeenCalledWith({ userId: 1 });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('TCQLBMTK29 :xoá cookie refreshToken trên trình duyệt', async () => {
    mockAllSuccess(); 
    const req = taoRequest();
    const res = taoResponse();
    await disableUser(req, res, mockNext);

    expect(res.clearCookie).toHaveBeenCalledWith('refreshToken');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('TCQLBMTK30 :thực hiện đủ cả 4 thao tác song song và trả về 200', async () => {
    mockAllSuccess(); 
    const req = taoRequest();
    const res = taoResponse();
    await disableUser(req, res, mockNext);

    expect(updateUserById).toHaveBeenCalledTimes(1);
    expect(updateUserDetailById).toHaveBeenCalledTimes(1);
    expect(updatePostByConditions).toHaveBeenCalledTimes(1);
    expect(removeTokenByCondition).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('TCQLBMTK31 :tăng tokenVersion đúng từ giá trị hiện tại (5 → 6)', async () => {
    mockAllSuccess(); 
    const req = taoRequest(); 
    req.currentUser!.users.tokenVersion = 5;
    req.currentUser!.users.id = 1;

    const res = taoResponse();
    await disableUser(req, res, mockNext);

    expect(updateUserById).toHaveBeenCalledWith(1, expect.objectContaining({
      tokenVersion: 6
    }));
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('TCQLBMTK32 :gọi next(error) khi gỡ bỏ token thất bại', async () => {
    // Trường hợp này KHÔNG cần mockAllSuccess vì ta muốn nó fail tại removeToken
    (removeTokenByCondition as jest.Mock).mockRejectedValue(new Error('Lỗi xoá token'));

    const req = taoRequest();
    const res = taoResponse();
    await disableUser(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    expect(res.clearCookie).not.toHaveBeenCalled();
  });

  it('TCQLBMTK33 :gọi next(error) khi bóc tách currentUser bị lỗi (undefined)', async () => {
    const req = { currentUser: undefined } as any;
    const res = taoResponse();

    await disableUser(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
  });

  it('TCQLBMTK34 :xử lý an toàn khi tokenVersion ban đầu bị null', async () => {
    mockAllSuccess(); 
    const req = taoRequest();
    req.currentUser!.users.tokenVersion = null as any;

    const res = taoResponse();
    await disableUser(req, res, mockNext);

    expect(updateUserById).toHaveBeenCalledWith(1, expect.objectContaining({
      tokenVersion: 1
    }));
    expect(res.status).toHaveBeenCalledWith(200);
  });
});