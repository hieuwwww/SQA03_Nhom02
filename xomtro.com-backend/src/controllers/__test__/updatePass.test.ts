import { StatusCodes } from 'http-status-codes';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
dayjs.extend(utc);

// 1. Mock triệt để các module phụ thuộc trước khi import controller
jest.mock('@/services/post.service', () => ({
  selectPostById: jest.fn(),
  updatePostById: jest.fn(),
  updatePassPostByPostId: jest.fn(),
  removeAllPassPostItemByPostId: jest.fn(),
  insertPassPostItem: jest.fn(),
  insertPostAssets: jest.fn(),
  selectFullPostDetailById: jest.fn(),
}));

jest.mock('@/services/location.service', () => ({
  geocodingByGoong: jest.fn(),
}));

jest.mock('@/utils/schema.helper', () => ({
  checkUserAndPostPermission: jest.fn(),
  cleanObject: jest.fn((obj) => obj), // Trả về chính nó để test logic body
}));

jest.mock('@/utils/constants.helper', () => ({
  generateSlug: jest.fn((text) => `slug-${text}`),
  cleanObject: jest.fn((obj) => obj),
}));

jest.mock('@/utils/time.helper', () => ({
  timeInVietNam: jest.fn(),
}));

// Thêm vào phần đầu file test (cùng với các mock khác)
jest.mock('@/services/asset.service.ts', () => ({
  uploadPostImageHandler: jest.fn(),
  insertPostAssetsHandler: jest.fn(),
}));



// Mock Service xử lý file (Cloudinary/S3...)
jest.mock('@/services/fileUpload.service', () => ({
  uploadImage: jest.fn(),
  deleteManyResources: jest.fn()
}));


// 2. Import sau khi Mock
const { updatePassPost } = require('@/controllers/post.controller');
const postService = require('@/services/post.service');
const locationService = require('@/services/location.service');
const schemaHelper = require('@/utils/schema.helper');
const timeHelper = require('@/utils/time.helper');

describe('updatePassPost - Comprehensive Test Suite', () => {
  let mockReq: any;
  let mockRes: any;
  let next: jest.Mock;

  const MOCK_NOW = '2026-04-19T10:00:00Z';

  beforeEach(() => {
    jest.clearAllMocks();
    next = jest.fn();
    mockRes = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };

    // Dữ liệu mẫu hợp lệ
    mockReq = {
      params: { postId: '300' },
      body: {
        title: 'Thanh lý đồ dùng',
        passItems: JSON.stringify([
          { passItemName: 'Bàn', passItemPrice: 100, passItemStatus: 'new' },
          { passItemName: 'Ghế', passItemPrice: 50, passItemStatus: 'used' }
        ]),
        addressProvince: 'HCM', addressDistrict: 'Q1', addressWard: 'P1',
        addressLatitude: 10, addressLongitude: 106,
        expirationAfter: 1,
        expirationAfterUnit: 'day'
      },
      currentUser: { 
        users_detail: { userId: 1, role: 'user' },
        users: { id: 1 } 
      }
    };

    // Mock mặc định để pass các Guard Clauses
    schemaHelper.checkUserAndPostPermission.mockReturnValue(true);
    timeHelper.timeInVietNam.mockReturnValue(dayjs(MOCK_NOW));
    postService.selectPostById.mockResolvedValue([{
      id: 300, ownerId: 1, type: 'pass', createdAt: MOCK_NOW, expirationAfter: 0
    }]);
    postService.updatePostById.mockResolvedValue(true);
    postService.removeAllPassPostItemByPostId.mockResolvedValue(true);
    postService.updatePassPostByPostId.mockResolvedValue(true);
    postService.insertPassPostItem.mockResolvedValue(true);
  });

  // --- NHÓM 1: CÁC NHÁNH LỖI (ERROR BRANCHES) ---

  test('TCQLBV56: postId trống - Expected 400', async () => {
    mockReq.params.postId = undefined;
    await updatePassPost(mockReq, mockRes, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: StatusCodes.BAD_REQUEST }));
  });

  test('TCQLBV57: Bài viết không tồn tại - Expected 404', async () => {
    postService.selectPostById.mockResolvedValue([]);
    await updatePassPost(mockReq, mockRes, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: StatusCodes.NOT_FOUND }));
  });

  test('TCQLBV58: PassItems trống hoặc sai định dạng - Expected 422', async () => {
    mockReq.body.passItems = JSON.stringify([]); // Mảng rỗng
    await updatePassPost(mockReq, mockRes, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ 
        statusCode: StatusCodes.UNPROCESSABLE_ENTITY,
        message: 'passItems can not be empty'
    }));
  });

  // --- NHÓM 2: LOGIC TÍNH GIÁ (PRICE LOGIC) ---

  test('TCQLBV59: Tính toán priceStart (min) và priceEnd (max) từ passItems', async () => {
    await updatePassPost(mockReq, mockRes, next);

    const actualPayload = postService.updatePassPostByPostId.mock.calls[0][1];
    // Min của 100 và 50 là 50, Max là 100
    expect(actualPayload.priceStart).toBe(50);
    expect(actualPayload.priceEnd).toBe(100);
  });

  // --- NHÓM 3: ĐỊA CHỈ & GEOCODING (GEO BRANCH) ---

  test('TCQLBV60: Tự động gọi Geocoding khi thiếu tọa độ', async () => {
    mockReq.body.addressLatitude = null;
    mockReq.body.addressLongitude = null;
    locationService.geocodingByGoong.mockResolvedValue({ latitude: 12, longitude: 34 });

    await updatePassPost(mockReq, mockRes, next);

    expect(locationService.geocodingByGoong).toHaveBeenCalled();
    const actualPayload = postService.updatePostById.mock.calls[0][1];
    expect(actualPayload.addressLatitude).toBe(12);
  });

  // --- NHÓM 4: LOGIC HẾT HẠN (EXPIRATION UNIT BRANCHES) ---

  test('TCQLBV61: Nhánh expirationAfterUnit = "hour"', async () => {
    // 1. Fix thời điểm tạo bài viết cố định (VD: 10:00 UTC)
    const fixedCreatedAt = dayjs.utc('2026-01-01T10:00:00Z'); 
    (postService.selectPostById as jest.Mock).mockResolvedValue([{ 
      id: 100, 
      ownerId: 1, 
      createdAt: fixedCreatedAt.toDate(),
      expirationAfter: 0 // Đảm bảo khác với giá trị mới (5) để nhảy vào logic tính toán
    }]);

    mockReq.body.expirationAfter = 5;
    mockReq.body.expirationAfterUnit = 'hour';

    await updatePassPost(mockReq, mockRes, next);

    const actualPayload = (postService.updatePostById as jest.Mock).mock.calls[0][1];
    
    // 2. So sánh bằng UTC hour để tránh lệch múi giờ
    // 10:00 + 5h = 15:00
    expect(dayjs(actualPayload.expirationTime).utc().get('hour')).toBe(15);
  });

  test('TCQLBV62: Nhánh expirationAfterUnit = "week"', async () => {
    mockReq.body.expirationAfter = 2;
    mockReq.body.expirationAfterUnit = 'week';

    await updatePassPost(mockReq, mockRes, next);

    const actualPayload = postService.updatePostById.mock.calls[0][1];
    // April 19 + 14 days = May 03
    expect(dayjs(actualPayload.expirationTime).get('date')).toBe(3);
    expect(dayjs(actualPayload.expirationTime).get('month')).toBe(4); // Tháng 5 (0-indexed)
  });

  test('TCQLBV63: Nhánh !Number(expirationAfter) - Hạn 99 năm', async () => {
    mockReq.body.expirationAfter = 0;

    await updatePassPost(mockReq, mockRes, next);

    const actualPayload = postService.updatePostById.mock.calls[0][1];
    expect(dayjs(actualPayload.expirationTime).get('year')).toBe(2125);
  });

  // --- NHÓM 5: FILES ASSETS ---

  test('TCQLBV64: Nhánh có upload file ảnh - Phải gọi uploadImage và insertPostAssets', async () => {
  // 1. Giả lập bài viết tồn tại và có quyền
  (postService.selectPostById as jest.Mock).mockResolvedValue([{ id: 100, ownerId: 1, type: 'pass' }]);
  (schemaHelper.checkUserAndPostPermission as jest.Mock).mockReturnValue(true);

  // 2. Giả lập có files gửi lên
  mockReq.files = [
    { buffer: Buffer.from('fake-image'), originalname: 'test.jpg' }
  ];

  // 3. Mock kết quả trả về từ service upload (Giả lập Cloudinary response)
  const mockCloudinaryRes = {
    secure_url: 'https://res.cloudinary.com/demo/image/upload/v1/test.jpg',
    public_id: 'test_public_id'
  };
  const { uploadImage } = require('@/services/fileUpload.service');
  (uploadImage as jest.Mock).mockResolvedValue(mockCloudinaryRes);

  // 4. Mock thành công cho việc lưu vào DB
  (postService.insertPostAssets as jest.Mock).mockResolvedValue([1]);
  (postService.selectFullPostDetailById as jest.Mock).mockResolvedValue({ id: 100 });

  // 5. Chạy Controller
  await updatePassPost(mockReq, mockRes, next);

  // 6. Kiểm chứng
  // Kiểm tra xem service upload có được gọi không
  expect(uploadImage).toHaveBeenCalled();
  
  // Kiểm tra xem service lưu DB có được gọi không
  expect(postService.insertPostAssets).toHaveBeenCalled();

  // Kiểm tra phản hồi cuối cùng
  expect(mockRes.send).toHaveBeenCalledWith(expect.objectContaining({
    message: expect.stringContaining('successfully')
  }));
});

});