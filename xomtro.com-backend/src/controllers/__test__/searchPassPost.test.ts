import { StatusCodes } from 'http-status-codes';
import dayjs from 'dayjs';

jest.mock('@/services/post.service', () => ({
  selectPassPostByConditions: jest.fn(),
}));

jest.mock('@/utils/time.helper', () => ({
  timeInVietNam: jest.fn(() => dayjs('2024-01-01T00:00:00Z')),
}));


jest.mock('@/services/post.service', () => ({
  selectPassPostByConditions: jest.fn(),
}));
// Thay vì dùng:
// jest.mock('@/utils/slug.helper', ...

// Hãy dùng đường dẫn tương đối từ file test này đến file helper:
jest.mock('../../utils/constants.helper', () => ({
  generateSlug: jest.fn((str) => 
    str.toLowerCase()
       .replace(/\s+/g, '-')
       .replace(/[đ]/g, 'd')
       .normalize('NFD')
       .replace(/[\u0300-\u036f]/g, '')
  )
}));
const { searchPassPosts } = require('@/controllers/post.controller');
const postService = require('@/services/post.service');

describe('searchPassPosts - Filter Focus Testing', () => {
  let mockReq: any;
  let mockRes: any;
  let next: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    next = jest.fn();
    mockRes = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
    mockReq = {
      body: {
        whereConditions: {},
        orderConditions: {},
        pagination: { page: 1, pageSize: 10 }
      }
    };
    postService.selectPassPostByConditions.mockResolvedValue([]);
  });

  // --- TEST BẢO VỆ ĐẦU VÀO ---
  test('TCLBV38: Kiểm tra throw 422 nếu thiếu bộ lọc cơ bản (where/order)', async () => {
    mockReq.body = {}; 
    await searchPassPosts(mockReq, mockRes, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 422 }));
  });


  // ---  TEST LOGIC SLUG & TÊN VẬT PHẨM ---
  test('TCLBV39: Kiểm tra map đúng tên vật phẩm sang Slug LIKE', async () => {
    mockReq.body.whereConditions.passItemName = 'Bàn làm việc';
    await searchPassPosts(mockReq, mockRes, next);

    const where = postService.selectPassPostByConditions.mock.calls[0][0];
    expect(where.passItemNameSlug.operator).toBe('like');
    expect(where.passItemNameSlug.value).toBe('%ban-lam-viec%');
  });

  // --- TEST LOGIC VỊ TRÍ (GEOLOCATION) ---
  test('TCLBV40: Kiểm tra Radius mặc định là 50 nếu không truyền', async () => {
    mockReq.body.whereConditions.nearest = { longitude: 105, latitude: 21 };
    await searchPassPosts(mockReq, mockRes, next);

    const where = postService.selectPassPostByConditions.mock.calls[0][0];
    expect(where.radius).toBe(50);
  });

  test('TCLBV41: Kiểm tra chấp nhận Radius = 0 (Tìm chính xác tại điểm)', async () => {
    mockReq.body.whereConditions.nearest = { longitude: 105, latitude: 21, radius: 0 };
    await searchPassPosts(mockReq, mockRes, next);

    const where = postService.selectPassPostByConditions.mock.calls[0][0];
    // FAIL nếu code dùng (radius ? radius : 50)
    expect(where.radius).toBe(0);
  });

  // --- TEST LOGIC THỜI GIAN ---
  test('TCLBV42: Kiểm tra tự gán thời gian hiện tại nếu thiếu dateEnd', async () => {
    mockReq.body.whereConditions.dateStart = '2024-01-01';
    await searchPassPosts(mockReq, mockRes, next);

    const where = postService.selectPassPostByConditions.mock.calls[0][0];
    expect(where.updatedAt.operator).toBe('between');
    expect(where.updatedAt.value[1]).toBeInstanceOf(Date); // Phải là ngày hiện tại (mocked)
  });

  // ---  TEST ENUM VALIDATION ---
  test('TCLBV43: Kiểm tra throw 400 nếu passItemStatus không hợp lệ', async () => {
    mockReq.body.whereConditions.passItemStatus = 'new_99_percent'; // Giả sử không có trong enum
    await searchPassPosts(mockReq, mockRes, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  // ---  TEST SẮP XẾP (ORDERING) ---
  test('TCLBV44: Kiểm tra map đúng orderConditions cho giá', async () => {
    mockReq.body.orderConditions.price = 'desc';
    await searchPassPosts(mockReq, mockRes, next);

    const options = postService.selectPassPostByConditions.mock.calls[0][1];
    expect(options.orderConditions.priceStart).toBe('desc');
  });

  
  it('TCLBV45: Kiểm tra chấp nhận tọa độ bằng 0', async () => {
    mockReq.body.whereConditions.nearest = { longitude: 0, latitude: 10.5 };
    await searchPassPosts(mockReq, mockRes, next);

    const where = postService.selectPassPostByConditions.mock.calls[0][0];
    expect(where.addressLongitude.value).toBe(0);
  });

  it('TCLBV46: Kiểm tra luôn ép type là pass kể cả khi body gửi type khác', async () => {
    mockReq.body.whereConditions.type = 'rental'; 
    await searchPassPosts(mockReq, mockRes, next);

    const where = postService.selectPassPostByConditions.mock.calls[0][0];
    expect(where.type.value).toBe('pass'); // Override thành công
  });
});


