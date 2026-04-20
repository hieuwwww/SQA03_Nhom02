import { StatusCodes, ReasonPhrases } from 'http-status-codes';

// 1. Mock Service
jest.mock('@/services/post.service', () => ({
  selectInterestedUserPostByConditions: jest.fn(),
}));

// 2. Mock ApiResponse (Chaining Pattern)
jest.mock('@/utils/ApiResponse.helper', () => ({
  ApiResponse: class {
    statusCode: number;
    message: string;
    data: any;
    constructor(statusCode: number, message: string, data: any) {
      this.statusCode = statusCode;
      this.message = message;
      this.data = data;
    }
    send(res: any) {
      return res.status(this.statusCode).send({
        statusCode: this.statusCode,
        message: this.message,
        data: this.data,
      });
    }
  },
}));

const { getInterestedUserPosts } = require('@/controllers/post.controller');
const postService = require('@/services/post.service');

describe('getInterestedUserPosts - Comprehensive Test', () => {
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

    // Dữ liệu hợp lệ chuẩn
    mockReq = {
      currentUser: { users: { id: 1 } },
      body: {
        whereConditions: { id: 10, postId: 200 },
        orderConditions: { createdAt: 'desc', updatedAt: 'asc' }
      }
    };
  });

  // --- 1. TEST PHỦ NHÁNH (BRANCH COVERAGE) ---

  test('TCQLBVDL14: Phủ tất cả điều kiện where và order (Happy Path)', async () => {
    postService.selectInterestedUserPostByConditions.mockResolvedValue([{ id: 1 }]);

    await getInterestedUserPosts(mockReq, mockRes, next);

    const [where, options] = postService.selectInterestedUserPostByConditions.mock.calls[0];
    
    // Kiểm tra mapping logic
    expect(where.id).toEqual({ operator: 'eq', value: 10 });
    expect(where.userId).toEqual({ operator: 'eq', value: 1 });
    expect(where.postId).toEqual({ operator: 'eq', value: 200 });
    expect(options.orderConditions.createdAt).toBe('desc');
    expect(mockRes.status).toHaveBeenCalledWith(StatusCodes.OK);
  });

  test('TCQLBVDL15: Nhánh các điều kiện optional bị thiếu (Null/Undefined)', async () => {
    mockReq.body = {
      whereConditions: {}, // Thiếu id và postId
      orderConditions: {}  // Thiếu sort
    };
    postService.selectInterestedUserPostByConditions.mockResolvedValue([]);

    await getInterestedUserPosts(mockReq, mockRes, next);

    const [where, options] = postService.selectInterestedUserPostByConditions.mock.calls[0];
    
    // Chỉ có userId (vì lấy từ currentUser)
    expect(where).toHaveProperty('userId');
    expect(where.id).toBeUndefined();
    expect(options.orderConditions).toEqual({});
  });

  // --- 2. TEST GIÁ TRỊ BIÊN (BOUNDARY CONDITIONS) ---

  test('TCQLBVDL16: Ép kiểu Number với giá trị chuỗi số "123"', async () => {
    mockReq.body.whereConditions.id = "123"; // String id
    
    await getInterestedUserPosts(mockReq, mockRes, next);

    const where = postService.selectInterestedUserPostByConditions.mock.calls[0][0];
    expect(where.id.value).toBe(123); // Phải là number
  });

  test('TCQLBVDL17: userId là số 0 (Falsy check)', async () => {
    mockReq.currentUser.users.id = 0;
    
    await getInterestedUserPosts(mockReq, mockRes, next);

    const where = postService.selectInterestedUserPostByConditions.mock.calls[0][0];
    // Nếu code dùng (users.id && ...), số 0 sẽ bị skip
    expect(where.userId).toBeUndefined();
  });

  // --- 3. TEST NGOẠI LỆ (EXCEPTION & CRASH) ---

  test('TCQLBVDL18: NGUY CƠ FAIL - whereConditions bị thiếu hoàn toàn', async () => {
    mockReq.body = { orderConditions: {} }; // Thiếu whereConditions

    await getInterestedUserPosts(mockReq, mockRes, next);

    // Code sẽ crash khi cố destructure { id, postId } từ undefined
    expect(next).toHaveBeenCalledWith(expect.any(TypeError));
  });

  test('TCQLBVDL19: NGUY CƠ FAIL - currentUser bị null', async () => {
    mockReq.currentUser = null;

    await getInterestedUserPosts(mockReq, mockRes, next);

    // Crash tại: const { users } = currentUser!;
    expect(next).toHaveBeenCalledWith(expect.any(TypeError));
  });

  test('TCQLBVDL20: id gửi lên không phải là số (NaN)', async () => {
    mockReq.body.whereConditions.id = "abc";

    await getInterestedUserPosts(mockReq, mockRes, next);

    const where = postService.selectInterestedUserPostByConditions.mock.calls[0][0];
    expect(where.id.value).toBeNaN(); 
    // Tùy vào Database, NaN có thể gây lỗi SQL hoặc trả về rỗng
  });

  test('TCQLBVDL21: Lỗi từ phía Service (Database sập)', async () => {
    postService.selectInterestedUserPostByConditions.mockRejectedValue(new Error('DB_ERROR'));

    await getInterestedUserPosts(mockReq, mockRes, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'DB_ERROR' }));
  });
});