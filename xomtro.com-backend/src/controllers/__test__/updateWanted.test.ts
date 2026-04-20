import { updateWantedPost } from '@/controllers/post.controller';
import * as postService from '@/services/post.service';
import * as locationService from '@/services/location.service';
import * as schemaHelper from '@/utils/schema.helper';
import ApiError from '@/utils/ApiError.helper';
import { StatusCodes } from 'http-status-codes';

// 1. Mock tất cả các module phụ thuộc
jest.mock('@/services/post.service');
jest.mock('@/services/location.service');
jest.mock('@/services/asset.service');
jest.mock('@/utils/schema.helper', () => ({
  checkUserAndPostPermission: jest.fn(),
  cleanObject: jest.fn((obj) => obj),
}));


// Nếu assetService hoặc postService import trực tiếp từ schema, mock luôn chúng
jest.mock('@/services/asset.service');

describe('updateWantedPost - Comprehensive Branch & Logic Coverage', () => {
  let mockReq: any;
  let mockRes: any;
  let next: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    next = jest.fn();
    mockRes = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    // 2. Thiết lập dữ liệu mẫu (Seed Data) chuẩn để tránh lỗi logic sơ đẳng
    mockReq = {
      params: { postId: '100' },
      body: {
        title: 'Cần tìm phòng trọ quận Cầu Giấy',
        priceStart: 2000000,
        priceEnd: 4000000,
        addressProvince: 'Hà Nội',
        addressDistrict: 'Cầu Giấy',
        addressWard: 'Dịch Vọng',
        addressLongitude: 105.79, // Có sẵn tọa độ để bypass Geocoding mặc định
        addressLatitude: 21.03,
        expirationAfter: 1,
        expirationAfterUnit: 'month',
        moveInDate: '2026-05-01'
      },
      currentUser: { users_detail: { userId: 1, role: 'user' } }
    };

    // 3. Mock Happy Path mặc định - Đảm bảo các hàm luôn trả về Promise thành công
    (postService.selectPostById as jest.Mock).mockResolvedValue([{ 
      id: 100, ownerId: 1, type: 'wanted', createdAt: new Date('2026-01-01T00:00:00Z'), expirationAfter: 1 
    }]);
    (schemaHelper.checkUserAndPostPermission as jest.Mock).mockReturnValue(true);
    (schemaHelper.cleanObject as jest.Mock).mockImplementation((obj) => obj);
    
    // Luôn mock kết quả cho các lệnh thực thi DB ở cuối hàm
    (postService.updatePostById as jest.Mock).mockResolvedValue([1]);
    (postService.updateWantedPostByPostId as jest.Mock).mockResolvedValue([1]);
    (postService.selectFullPostDetailById as jest.Mock).mockResolvedValue({ id: 100, title: 'Updated' });
  });

  // --- NHÓM 1: ĐIỀU KIỆN DỪNG SỚM (GUARD CLAUSES) ---

  test('TCQLBV40: Lỗi 400 khi thiếu postId trong params', async () => {
    mockReq.params.postId = undefined;
    await updateWantedPost(mockReq, mockRes, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: StatusCodes.BAD_REQUEST }));
  });

  test('TCQLBV41: Lỗi 404 khi bài viết không tồn tại', async () => {
    (postService.selectPostById as jest.Mock).mockResolvedValue([]);
    await updateWantedPost(mockReq, mockRes, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: StatusCodes.NOT_FOUND }));
  });

  // --- NHÓM 2: LOGIC GIÁ CẢ (PRICE LOGIC) ---

  test('TCQLBV42: priceEnd tự gán bằng priceStart nếu priceEnd không hợp lệ (0/NaN)', async () => {
    mockReq.body.priceStart = 3000;
    mockReq.body.priceEnd = 0;

    await updateWantedPost(mockReq, mockRes, next);

    const payload = (postService.updateWantedPostByPostId as jest.Mock).mock.calls[0][1];
    expect(payload.priceEnd).toBe(3000);
  });

  test('TCQLBV43: Tự động hoán đổi (Swap) nếu priceStart > priceEnd', async () => {
    mockReq.body.priceStart = 5000;
    mockReq.body.priceEnd = 2000;

    await updateWantedPost(mockReq, mockRes, next);

    const payload = (postService.updateWantedPostByPostId as jest.Mock).mock.calls[0][1];
    expect(payload.priceStart).toBe(2000);
    expect(payload.priceEnd).toBe(5000);
  });

  // --- NHÓM 3: LOGIC THỜI GIAN (EXPIRATION & DATE) ---

  test('TCQLBV44: Tính expirationTime chính xác theo đơn vị "hour"', async () => {
    mockReq.body.expirationAfter = 10;
    mockReq.body.expirationAfterUnit = 'hour';
    // Đảm bảo giá trị mới khác giá trị cũ trong DB (1) để nhảy vào nhánh tính toán
    (postService.selectPostById as jest.Mock).mockResolvedValue([{ 
      id: 100, ownerId: 1, createdAt: new Date('2026-01-01T00:00:00Z'), expirationAfter: 1 
    }]);

    await updateWantedPost(mockReq, mockRes, next);

    const payload = (postService.updatePostById as jest.Mock).mock.calls[0][1];
    // 00:00 + 10h = 10:00
    expect(payload.expirationTime.toISOString()).toContain('T10:00:00');
  });

  test('TCQLBV45: Hạn mặc định 99 năm nếu expirationAfter truyền vào là 0 hoặc undefined', async () => {
    mockReq.body.expirationAfter = 0;
    await updateWantedPost(mockReq, mockRes, next);

    const payload = (postService.updatePostById as jest.Mock).mock.calls[0][1];
    expect(payload.expirationTime.getFullYear()).toBe(2125); // 2026 + 99
  });

  // --- NHÓM 4: ĐỊA CHỈ & GEOCODING ---

  test('TCQLBV46: Gọi Geocoding Service khi thiếu tọa độ', async () => {
    mockReq.body.addressLongitude = null;
    (locationService.geocodingByGoong as jest.Mock).mockResolvedValue({ longitude: 106.5, latitude: 10.5 });

    await updateWantedPost(mockReq, mockRes, next);

    expect(locationService.geocodingByGoong).toHaveBeenCalled();
    const payload = (postService.updatePostById as jest.Mock).mock.calls[0][1];
    expect(payload.addressLongitude).toBe(106.5);
  });

  test('TCQLBV47: Bypass Geocoding khi đã có tọa độ trong body', async () => {
    mockReq.body.addressLongitude = 108.0;
    mockReq.body.addressLatitude = 15.0;

    await updateWantedPost(mockReq, mockRes, next);

    expect(locationService.geocodingByGoong).not.toHaveBeenCalled();
  });

  // --- NHÓM 5: NGOẠI LỆ & LỖI HỆ THỐNG ---

  test('TCQLBV48: Bắt lỗi (Catch Error) khi Database bị sập', async () => {
    (postService.updatePostById as jest.Mock).mockRejectedValue(new Error('Database Crash'));

    await updateWantedPost(mockReq, mockRes, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  test('TCQLBV49: Trả về thành công 200 và dữ liệu chi tiết', async () => {
    // 1. Dữ liệu giả lập cuối cùng
    const finalData = { id: 100, title: 'Final Post' };
    (postService.selectFullPostDetailById as jest.Mock).mockResolvedValue(finalData);

    // 2. Chạy controller
    await updateWantedPost(mockReq, mockRes, next);

    if (next.mock.calls.length > 0) {
      console.log('CONTROLLER CRASHED WITH ERROR:', next.mock.calls[0][0]);
    }

    // 4. Kiểm tra
    expect(mockRes.status).toHaveBeenCalledWith(StatusCodes.OK);
    
    // Lưu ý: Kiểm tra xem Controller của bạn dùng res.send, res.json hay ApiResponse
    // Nếu bạn dùng res.json({ data: ... }) thì phải expect mockRes.json
    expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ data: finalData }));
  });


});