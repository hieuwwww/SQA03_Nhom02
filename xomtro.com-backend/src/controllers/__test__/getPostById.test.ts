import { StatusCodes, ReasonPhrases } from 'http-status-codes';




jest.mock('@/services/post.service', () => ({
  selectPostById: jest.fn(),
  selectFullPostDetailById: jest.fn(),
}));

// Mock ApiResponse để đảm bảo hàm .send(res) hoạt động
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

const { getPostById } = require('@/controllers/post.controller');
const postService = require('@/services/post.service');

describe('getPostById - Branch & Edge Case Testing', () => {
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
      params: { postId: '100' }
    };
  });

  // --- NHÓM 1: PHỦ NHÁNH ĐIỀU KIỆN ĐẦU VÀO (GUARD CLAUSES) ---

  test('TCQLBV1: Kiểm tra hệ thống khi thiếu postId trong params - Expected 400', async () => {
    mockReq.params = {}; // postId undefined
    await getPostById(mockReq, mockRes, next);
    
    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      statusCode: StatusCodes.BAD_REQUEST
    }));
  });

  test('TCQLBV2: Kiểm tra postId không phải là số (NaN) - Biên ngoại lệ', async () => {
    mockReq.params.postId = 'abc';
    // selectPostById(Number('abc')) sẽ nhận vào NaN
    postService.selectPostById.mockResolvedValue([]);
    
    await getPostById(mockReq, mockRes, next);
    expect(mockRes.status).toHaveBeenCalledWith(StatusCodes.NOT_FOUND);
  });

  // --- NHÓM 2: PHỦ NHÁNH LOGIC DỮ LIỆU (DATA FLOW) ---

  test('TCQLBV3: Kiểm tra không tìm thấy bài viết ở bước kiểm tra sơ bộ - Expected 404', async () => {
    postService.selectPostById.mockResolvedValue([]); // Trả về mảng rỗng
    
    await getPostById(mockReq, mockRes, next);

    expect(postService.selectPostById).toHaveBeenCalledWith(100);
    expect(mockRes.status).toHaveBeenCalledWith(StatusCodes.NOT_FOUND);
    expect(postService.selectFullPostDetailById).not.toHaveBeenCalled(); // Không được chạy bước tiếp theo
  });

  test('TCQLBV4: Kiểm tra việc tìm thấy bài viết sơ bộ nhưng không tìm thấy chi tiết - Expected 404', async () => {
    // Bước 1: Thấy có post type là rental
    postService.selectPostById.mockResolvedValue([{ id: 100, type: 'rental' }]);
    // Bước 2: Tìm detail thì lại rỗng (dữ liệu không nhất quán)
    postService.selectFullPostDetailById.mockResolvedValue([]);

    await getPostById(mockReq, mockRes, next);

    expect(mockRes.status).toHaveBeenCalledWith(StatusCodes.NOT_FOUND);
  });

  test('TCQLBV5: Kiểm tra việc có kết quả detail nhưng trường .detail bị null/undefined - Expected 404', async () => {
    postService.selectPostById.mockResolvedValue([{ id: 100, type: 'rental' }]);
    // Giả lập selectResult[0].detail không tồn tại
    postService.selectFullPostDetailById.mockResolvedValue([{ id: 100, otherField: 'something' }]);

    await getPostById(mockReq, mockRes, next);

    expect(mockRes.status).toHaveBeenCalledWith(StatusCodes.NOT_FOUND);
  });

  // --- NHÓM 3: NHÁNH THÀNH CÔNG (HAPPY PATH) ---

  test('TCQLBV6: Kiểm tra việc lấy bài viết thành công - Expected 200', async () => {
    // 1. Dữ liệu giả lập cho bước 1
    postService.selectPostById.mockResolvedValue([{ id: 100, type: 'rental' }]);

    // 2. Dữ liệu giả lập cho bước 2 (Phải có trường detail và không được rỗng)
    const mockFullData = [{ 
      id: 100, 
      type: 'rental',
      detail: { content: 'Phòng trọ đẹp' } // BẮT BUỘC phải có trường detail
    }];
    postService.selectFullPostDetailById.mockResolvedValue(mockFullData);

    await getPostById(mockReq, mockRes, next);

    // DEBUG: Nếu vẫn fail, dòng này sẽ cho biết lỗi ở đâu
    if (next.mock.calls.length > 0) {
      console.error('CATCH ERROR:', next.mock.calls[0][0]);
    }

    // Kiểm tra Service được gọi đúng type từ kết quả của hàm 1
    expect(postService.selectFullPostDetailById).toHaveBeenCalledWith(100, 'rental');

    // Kiểm tra kết quả trả về
    expect(mockRes.status).toHaveBeenCalledWith(StatusCodes.OK);
    expect(mockRes.send).toHaveBeenCalledWith(expect.objectContaining({
      data: mockFullData
    }));
  });

  // --- NHÓM 4: XỬ LÝ NGOẠI LỆ (EXCEPTION HANDLING) ---

  test('TCQLBV7: Kiểm tra khi có lỗi Database ở bước selectPostById - Expected next(error)', async () => {
    const dbError = new Error('Database Connection Lost');
    postService.selectPostById.mockRejectedValue(dbError);

    await getPostById(mockReq, mockRes, next);

    expect(next).toHaveBeenCalledWith(dbError);
  });


  // --- NGUY CƠ DỮ LIỆU TRẢ VỀ LÀ [NULL] ---
  test('TCQLBV8: Kiểm tra hệ thống trả về mảng chứa phần tử null [null]', async () => {
    mockReq = { params: { postId: '100' } };
    postService.selectPostById.mockResolvedValue([{ id: 100, type: 'rental' }]);
    
    // Nguy hiểm: Mảng có độ dài là 1, nhưng phần tử bên trong là null
    postService.selectFullPostDetailById.mockResolvedValue([null]);

    await getPostById(mockReq, mockRes, next);

    // Code bạn viết: if (!selectResult.length || !selectResult[0].detail)
    // Nếu selectResult[0] là null -> !null.detail sẽ gây CRASH (TypeError)
    expect(next).toHaveBeenCalledWith(expect.any(TypeError));
  });

  // --- NGUY CƠ SỐ NGUYÊN VƯỢT GIỚI HẠN (MAX_SAFE_INTEGER) ---
  test('TCQLBV9: Kiểm tra postId vượt mức an toàn của JavaScript', async () => {
    const hugeId = '9007199254740999'; // Lớn hơn Number.MAX_SAFE_INTEGER
    mockReq = { params: { postId: hugeId } };

    await getPostById(mockReq, mockRes, next);

    // Kiểm tra xem controller có xử lý chặn ID không an toàn không
    // (Nếu bạn không dùng Number.isSafeInteger, ID này sẽ bị làm tròn sai khi gửi xuống DB)
    const callArg = postService.selectPostById.mock.calls[0][0];
    expect(callArg).toBeLessThan(Number.MAX_SAFE_INTEGER); 
  });

  // --- NGUY CƠ PROTOTYPE POLLUTION TRONG PARAMS ---
  test('TCQLBV10: Kiểm tra postId gửi lên dạng mảng hoặc object phức tạp', async () => {
    mockReq = { 
        params: { postId: { '$ne': null } } // Giả lập NoSQL Injection hoặc cấu trúc lạ
    };

    await getPostById(mockReq, mockRes, next);

    // Number({'$ne': null}) trả về NaN
    // Code cần đảm bảo NaN không gây lỗi logic nghiêm trọng
    expect(next).not.toHaveBeenCalled();
    expect(mockRes.status).toHaveBeenCalledWith(StatusCodes.NOT_FOUND);
  });
});

