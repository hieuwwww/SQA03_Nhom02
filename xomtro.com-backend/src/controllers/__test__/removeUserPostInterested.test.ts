import { StatusCodes, ReasonPhrases } from 'http-status-codes';
import { getInterestedUserPosts } from '../post.controller';



const { removeUserPostInterested } = require('@/controllers/post.controller');
const postService = require('@/services/post.service');


// Sử dụng giá trị trực tiếp thay vì phụ thuộc hoàn toàn vào enum để tránh lỗi undefined trong mock
const STATUS_OK = 200;
const STATUS_UNPROCESSABLE = 422;
const STATUS_BAD_REQUEST = 400;

// 1. Mock Services
jest.mock('@/services/post.service', () => ({
  selectInterestedUserPostByConditions: jest.fn(),
  deleteUserPostInterestByConditions: jest.fn(),
}));

// 2. Mock ApiResponse - Quan trọng: Phải trả về object có hàm send
jest.mock('@/utils/ApiResponse.helper', () => ({
  ApiResponse: class {
    constructor(public statusCode: number, public message: string, public data: any) {}
    send(res: any) {
      return res.status(this.statusCode).send({
        message: this.message,
        data: this.data
      });
    }
  },
}));

// 3. Mock ApiError
jest.mock('@/utils/ApiError.helper', () => {
  return class ApiError extends Error {
    constructor(public statusCode: number, public message: string) {
      super(message);
    }
  };
});

describe('removeUserPostInterested - Final Fix', () => {
  let mockReq: any;
  let mockRes: any;
  let next: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    next = jest.fn();
    
    // Đảm bảo status() trả về chính nó (this/mockRes) để có thể gọi .send()
    mockRes = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };

    mockReq = {
      params: { postId: '100' },
      currentUser: { users: { id: 1 } }
    };
  });

  // --- NHÓM 1: KIỂM TRA ĐIỀU KIỆN CHẶN (GUARD CLAUSES) ---

  test('TCQLBVDL22: Thiếu postId trong params - Expected 422', async () => {
    mockReq.params.postId = undefined;

    await removeUserPostInterested(mockReq, mockRes, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      statusCode: StatusCodes.UNPROCESSABLE_ENTITY
    }));
  });

  test('TCQLBVDL23: Bản ghi quan tâm không tồn tại (Hoặc không thuộc về User này) - Expected 400', async () => {
    // Giả lập DB không tìm thấy sự kết hợp giữa userId=1 và postId=100
    postService.selectInterestedUserPostByConditions.mockResolvedValue([]);

    await removeUserPostInterested(mockReq, mockRes, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      statusCode: StatusCodes.BAD_REQUEST,
      message: ReasonPhrases.BAD_REQUEST
    }));
    expect(postService.deleteUserPostInterestByConditions).not.toHaveBeenCalled();
  });

  

  test('TCQLBVDL24: Xử lý postId là chuỗi số "200" (Boundary check)', async () => {
    mockReq.params.postId = "200";
    postService.selectInterestedUserPostByConditions.mockResolvedValue([{ id: 1 }]);

    await removeUserPostInterested(mockReq, mockRes, next);

    // Kiểm tra Number(postId) đã hoạt động
    const callArgs = postService.selectInterestedUserPostByConditions.mock.calls[0][0];
    expect(callArgs.postId.value).toBe(200);
    expect(typeof callArgs.postId.value).toBe('number');
  });

  // --- NHÓM 3: NGOẠI LỆ & NGUY CƠ CRASH (EXCEPTIONS) ---

  test('TCQLBVDL25: NGUY CƠ FAIL - currentUser bị null', async () => {
    mockReq.currentUser = null;

    await removeUserPostInterested(mockReq, mockRes, next);

    // Sẽ văng TypeError tại dòng: const { users } = currentUser!;
    expect(next).toHaveBeenCalledWith(expect.any(TypeError));
  });

  test('TCQLBVDL26: postId gửi lên là giá trị không phải số (NaN)', async () => {
    mockReq.params.postId = "abc";
    
    await removeUserPostInterested(mockReq, mockRes, next);

    // Number("abc") là NaN. DB service có thể trả về [] hoặc crash.
    // Nếu trả về [], controller ném 400 (Bad Request) - Đúng logic bảo mật.
    const callArgs = postService.selectInterestedUserPostByConditions.mock.calls[0][0];
    expect(callArgs.postId.value).toBeNaN();
  });

  test('TCQLBVDL27: Lỗi Database bất ngờ trong lúc xóa', async () => {
    postService.selectInterestedUserPostByConditions.mockResolvedValue([{ id: 1 }]);
    postService.deleteUserPostInterestByConditions.mockRejectedValue(new Error('FOREIGN_KEY_FAILURE'));

    await removeUserPostInterested(mockReq, mockRes, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      message: 'FOREIGN_KEY_FAILURE'
    }));
  });

  test('TCQLBVDL28: Xóa thành công bài viết quan tâm - Expected 200', async () => {
    // Giả lập tìm thấy bản ghi (mảng có phần tử)
    postService.selectInterestedUserPostByConditions.mockResolvedValue([{ id: 50 }]);
    postService.deleteUserPostInterestByConditions.mockResolvedValue(true);

    await removeUserPostInterested(mockReq, mockRes, next);

    // 1. Kiểm tra không có lỗi nào đẩy vào next
    if (next.mock.calls.length > 0) {
        console.error('Controller bị crash giữa chừng:', next.mock.calls[0][0]);
    }
    expect(next).not.toHaveBeenCalled();

    // 2. Kiểm tra status 200
    // Nếu vẫn nhận 'undefined', hãy check xem file controller có thực sự truyền StatusCodes.OK không
    expect(mockRes.status).toHaveBeenCalledWith(200);

    // 3. Kiểm tra logic tham số truyền vào service
    expect(postService.deleteUserPostInterestByConditions).toHaveBeenCalledWith(
      expect.objectContaining({
        postId: { operator: 'eq', value: 100 },
        userId: { operator: 'eq', value: 1 }
      })
    );
  });

});

describe('Workflow: Remove and Verify Consistency', () => {
  let mockReq: any;
  let mockRes: any;
  let next: jest.Mock;

  // Hàm helper để tạo mới mockRes tránh chồng chéo dữ liệu
  const createMockRes = () => ({
    status: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    next = jest.fn();
    mockRes = createMockRes();
  });

  test('TCQLBVDL29: Sau khi xóa thành công, truy cập lại danh sách phải trả về rỗng', async () => {
    const userId = 1;
    const postId = 100;
    
    mockReq = {
      params: { postId: postId.toString() },
      currentUser: { users: { id: userId } },
      body: { 
        whereConditions: { postId },
        orderConditions: {} 
      }
    };

    // --- BƯỚC 1: XÓA ---
    postService.selectInterestedUserPostByConditions.mockResolvedValueOnce([{ id: 50 }]);
    postService.deleteUserPostInterestByConditions.mockResolvedValueOnce(true);

    await removeUserPostInterested(mockReq, mockRes, next);

    expect(mockRes.status).toHaveBeenCalledWith(STATUS_OK);
    expect(mockRes.send).toHaveBeenCalledWith(expect.objectContaining({
      data: 'Delete interested user post successfully'
    }));

    // --- QUAN TRỌNG: RESET MOCKRES TRƯỚC KHI GỌI HÀM TIẾP THEO ---
    mockRes = createMockRes(); 

    // --- BƯỚC 2: TRUY CẬP LẠI ---
    // Mock cho lần gọi select tiếp theo trong hàm get
    postService.selectInterestedUserPostByConditions.mockResolvedValueOnce([]);

    await getInterestedUserPosts(mockReq, mockRes, next);

    // Kiểm tra xem có lỗi crash không
    if (next.mock.calls.length > 0) {
        console.error('Crash tại Get:', next.mock.calls[0][0]);
    }

    // Bây giờ data phải là mảng rỗng từ lần gọi GET
    expect(mockRes.send).toHaveBeenCalledWith(expect.objectContaining({
      data: [] 
    }));
    expect(mockRes.status).toHaveBeenCalledWith(STATUS_OK);
  });

  test('TCQLBVDL30: Không cho phép xóa lại lần 2 (Idempotency)', async () => {
    mockReq = {
      params: { postId: '100' },
      currentUser: { users: { id: 1 } }
    };

    // Lần 1: Xóa thành công
    postService.selectInterestedUserPostByConditions.mockResolvedValueOnce([{ id: 50 }]);
    await removeUserPostInterested(mockReq, mockRes, next);
    expect(mockRes.status).toHaveBeenCalledWith(STATUS_OK);

    // RESET để xóa sạch lịch sử call trước khi test lần 2
    mockRes = createMockRes();
    jest.clearAllMocks(); // Xóa cả số lần call của postService

    // Lần 2: Xóa tiếp (DB trả về rỗng)
    postService.selectInterestedUserPostByConditions.mockResolvedValueOnce([]);
    
    await removeUserPostInterested(mockReq, mockRes, next);

    // Lần này phải vào next(ApiError) với status 400
    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      statusCode: STATUS_BAD_REQUEST
    }));
  });
});


describe('interestedPost - HIGH RISK FAIL SCENARIOS', () => {
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
  });

  // --- RISK 4: LỖI KHI ĐIỀU KIỆN WHERE TRỐNG RỖNG ---
  test('TCQLBVDL31: removeUserPostInterested với postId là chuỗi rỗng', async () => {
    mockReq = {
      params: { postId: "" },
      currentUser: { users: { id: 1 } }
    };

    await removeUserPostInterested(mockReq, mockRes, next);

    // if (!postId) ném 422. Nhưng nếu postId là " " (có khoảng trắng)?
    // Test này kiểm tra tính chặt chẽ của việc trim() dữ liệu.
    expect(next).toHaveBeenCalled();
  });

  // --- RISK 5: DATABASE TIMEOUT GIỮA CHỪNG ---
  test('TCQLBVDL32: Lỗi khi select thành công nhưng delete thất bại do mất kết nối', async () => {
    mockReq = {
      params: { postId: '100' },
      currentUser: { users: { id: 1 } }
    };

    postService.selectInterestedUserPostByConditions.mockResolvedValueOnce([{ id: 1 }]);
    // Giả lập DB bị ngắt kết nối ngay trước khi xóa
    postService.deleteUserPostInterestByConditions.mockRejectedValueOnce(new Error('Connection Lost'));

    await removeUserPostInterested(mockReq, mockRes, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Connection Lost' }));
    expect(mockRes.send).not.toHaveBeenCalled();
  });
});