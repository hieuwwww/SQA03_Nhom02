import { StatusCodes, ReasonPhrases } from 'http-status-codes';

// 1. MOCK TẤT CẢ SERVICES (Ngăn Drizzle/DB chạy thật)
jest.mock('@/services/post.service', () => ({
  selectPostById: jest.fn(),
  insertUserPostInterested: jest.fn(),
}));

// 2. MOCK API ERROR (Để kiểm tra lỗi ném ra)
jest.mock('@/utils/ApiError.helper', () => {
  return class ApiError extends Error {
    statusCode: number;
    constructor(statusCode: number, message: string) {
      super(message);
      this.statusCode = statusCode;
    }
  };
});

// 3. MOCK API RESPONSE (Quan trọng: Phải chain được hàm .send())
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

// 4. IMPORT SAU KHI MOCK
const { createUserPostInterested } = require('@/controllers/post.controller');
const postService = require('@/services/post.service');

describe('createUserPostInterested - Branch Coverage', () => {
  let mockReq: any;
  let mockRes: any;
  let next: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    next = jest.fn();
    
    // Mock Response object với chaining pattern
    mockRes = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };

    // User giả lập
    mockReq = {
      body: { postId: 100 },
      currentUser: { users: { id: 1 } }
    };
  });

  // --- NHÁNH 1: THIẾU POSTID (UNPROCESSABLE_ENTITY) ---
  test('TCQLBVDL1: Nên ném lỗi 422 nếu postId bị thiếu', async () => {
    mockReq.body.postId = undefined;

    await createUserPostInterested(mockReq, mockRes, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      statusCode: StatusCodes.UNPROCESSABLE_ENTITY,
      message: ReasonPhrases.UNPROCESSABLE_ENTITY
    }));
    expect(mockRes.send).not.toHaveBeenCalled();
  });

  // --- NHÓM 2: POST KHÔNG TỒN TẠI (NOT_FOUND) ---
  test('TCQLBVDL2: Nên ném lỗi 404 nếu postId không có trong Database', async () => {
    // Giả lập DB trả về mảng rỗng
    postService.selectPostById.mockResolvedValue([]);

    await createUserPostInterested(mockReq, mockRes, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      statusCode: StatusCodes.NOT_FOUND,
      message: ReasonPhrases.NOT_FOUND
    }));
    expect(postService.insertUserPostInterested).not.toHaveBeenCalled();
  });

  // --- NHÓM 3: THÀNH CÔNG (HAPPY PATH) ---
  test('TCQLBVDL3: Nên trả về 201 nếu lưu thành công', async () => {
    // Giả lập tìm thấy post và insert thành công
    postService.selectPostById.mockResolvedValue([{ id: 100 }]);
    postService.insertUserPostInterested.mockResolvedValue(true);

    await createUserPostInterested(mockReq, mockRes, next);

    // Kiểm tra service được gọi đúng userId từ currentUser và postId từ body
    expect(postService.insertUserPostInterested).toHaveBeenCalledWith({
      userId: 1,
      postId: 100
    });

    // Kiểm tra Response trả về đúng format
    expect(mockRes.status).toHaveBeenCalledWith(StatusCodes.CREATED);
    expect(mockRes.send).toHaveBeenCalledWith(expect.objectContaining({
      statusCode: StatusCodes.CREATED,
      data: { postId: 100 }
    }));
  });

  // --- NHÓM 4: LỖI HỆ THỐNG (CATCH BLOCK) ---
  test('TCQLBVDL4: Nên bắt lỗi (next) nếu service bị crash', async () => {
    const error = new Error('Database down');
    postService.selectPostById.mockRejectedValue(error);

    await createUserPostInterested(mockReq, mockRes, next);

    expect(next).toHaveBeenCalledWith(error);
  });

  // --- 1. KIỂM TRA KIỂU DỮ LIỆU CỦA POSTID ---
  test('TCQLBVDL5: Chấp nhận postId dưới dạng chuỗi số (Stringified Number)', async () => {
    mockReq = {
      body: { postId: "100" }, // Gửi string thay vì number
      currentUser: { users: { id: 1 } }
    };
    postService.selectPostById.mockResolvedValue([{ id: 100 }]);

    await createUserPostInterested(mockReq, mockRes, next);

    // Kiểm tra xem service có nhận được đúng giá trị không
    expect(postService.selectPostById).toHaveBeenCalledWith("100");
    expect(mockRes.status).toHaveBeenCalledWith(StatusCodes.CREATED);
  });

  test('TCQLBVDL6: Xử lý postId bằng 0 (Falsy value)', async () => {
    mockReq = {
      body: { postId: 0 }, // 0 là falsy trong JS
      currentUser: { users: { id: 1 } }
    };

    await createUserPostInterested(mockReq, mockRes, next);

    // Vì !postId (0) là true, nó phải ném lỗi 422
    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      statusCode: StatusCodes.UNPROCESSABLE_ENTITY
    }));
  });

  // --- 2. KIỂM TRA BẢO MẬT & ĐỐI TƯỢNG (SECURITY & CONTEXT) ---
  test('TCQLBVDL7: Đảm bảo lấy userId từ token (currentUser), không lấy từ body', async () => {
    mockReq = {
      body: { postId: 100, userId: 999 }, // Kẻ tấn công cố tình chèn userId khác vào body
      currentUser: { users: { id: 1 } }    // ID thực sự từ token
    };
    postService.selectPostById.mockResolvedValue([{ id: 100 }]);

    await createUserPostInterested(mockReq, mockRes, next);

    // Phải gọi service với userId là 1, KHÔNG PHẢI 999
    expect(postService.insertUserPostInterested).toHaveBeenCalledWith({
      userId: 1,
      postId: 100
    });
  });

  // --- 3. KIỂM TRA RACE CONDITION / DB DELAY ---
  test('TCQLBVDL8: Xử lý khi DB trả về dữ liệu rác (null/undefined) thay vì mảng', async () => {
    postService.selectPostById.mockResolvedValue(null); // Giả lập lỗi service trả về null

    await createUserPostInterested(mockReq, mockRes, next);

    // Code dùng selectPostResponse.length sẽ crash nếu là null -> Catch sẽ bắt được
    expect(next).toHaveBeenCalled();
  });

  // --- 4. KIỂM TRA LỖI LOGIC DB (DUPLICATE KEY) ---
  test('TCQLBVDL9: Xử lý lỗi khi user đã "quan tâm" bài viết này rồi (Unique Constraint)', async () => {
    mockReq = {
      body: { postId: 100 },
      currentUser: { users: { id: 1 } }
    };
    postService.selectPostById.mockResolvedValue([{ id: 100 }]);
    
    // Giả lập lỗi Duplicate Entry từ Database
    const dbError = new Error('Duplicate entry for key interested');
    postService.insertUserPostInterested.mockRejectedValue(dbError);

    await createUserPostInterested(mockReq, mockRes, next);

    expect(next).toHaveBeenCalledWith(dbError);
  });

  // --- TEST 1: CRASH KHI MIDDLEWARE LỖI ---
  test('TCQLBVDL10: Crash khi currentUser bị null (Lỗi logic Middleware)', async () => {
    mockReq = {
      body: { postId: 100 },
      currentUser: null // Giả lập lỗi middleware không gán user
    };

    await createUserPostInterested(mockReq, mockRes, next);

    // Nếu code bạn dùng currentUser!, dòng này sẽ ném TypeError thay vì ApiError
    // Kiểm tra xem nó có nhảy vào catch(error) và gọi next() không
    expect(next).toHaveBeenCalledWith(expect.any(TypeError));
  });

  // --- TEST 2: ĐẦU VÀO LÀ MẢNG (SNEAKY INPUT) ---
  test('TCQLBVDL11: postId được gửi dưới dạng mảng [100, 200]', async () => {
    mockReq = {
      body: { postId: [100, 200] }, // Gửi mảng thay vì số
      currentUser: { users: { id: 1 } }
    };
    
    // Giả lập selectPostById không xử lý mảng và crash
    postService.selectPostById.mockRejectedValue(new Error('ER_BAD_ARRAY_ERROR'));

    await createUserPostInterested(mockReq, mockRes, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      message: 'ER_BAD_ARRAY_ERROR'
    }));
  });

  // --- TEST 3: EXTREME VALUES (SỐ ÂM HOẶC FLOAT) ---
  test('TCQLBVDL12: postId là số thập phân hoặc số âm', async () => {
    mockReq = {
      body: { postId: 100.5 }, // ID thường là Integer, gửi Float xem sao
      currentUser: { users: { id: 1 } }
    };
    
    postService.selectPostById.mockResolvedValue([]); // DB thường không tìm thấy ID decimal

    await createUserPostInterested(mockReq, mockRes, next);

    // Mong đợi ném lỗi 404 vì ID 100.5 không thể tồn tại
    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      statusCode: StatusCodes.NOT_FOUND
    }));
  });

  // --- TEST 4: CHÈN SQL INJECTION STRING ---
  test('TCQLBVDL13: postId chứa chuỗi tấn công "1 OR 1=1"', async () => {
    mockReq = {
      body: { postId: "1 OR 1=1" },
      currentUser: { users: { id: 1 } }
    };
    
    postService.selectPostById.mockResolvedValue([]); 

    await createUserPostInterested(mockReq, mockRes, next);

    // Đảm bảo code không bị lừa bởi chuỗi truthy, vẫn phải qua check length
    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      statusCode: StatusCodes.NOT_FOUND
    }));
  });
});

