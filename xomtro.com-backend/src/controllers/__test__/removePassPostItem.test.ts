import { StatusCodes } from 'http-status-codes';

// 1. Mock triệt để các module service và helper
jest.mock('@/services/post.service', () => ({
  selectPostById: jest.fn(),
  selectPassPostItemsByPostId: jest.fn(),
  deleteManyPassPostItems: jest.fn(),
}));

jest.mock('@/utils/schema.helper', () => ({
  checkUserAndPostPermission: jest.fn(),
}));

// 2. Import bằng require để tránh lỗi Drizzle Schema
const { removePassPostItems } = require('@/controllers/post.controller');
const postService = require('@/services/post.service');
const schemaHelper = require('@/utils/schema.helper');

describe('removePassPostItems - Branch & Condition Coverage', () => {
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

    // Giả lập Request mặc định
    mockReq = {
      params: { postId: '100' },
      query: { passItemIds: ['501', '502'] }, // Giả lập mảng ID gửi lên
      currentUser: {
        users_detail: { userId: 1, role: 'user' }
      }
    };

    // Setup Mock mặc định cho các Guard Clauses
    schemaHelper.checkUserAndPostPermission.mockReturnValue(true);
    postService.selectPostById.mockResolvedValue([{ id: 100, ownerId: 1, type: 'pass' }]);
    
    // Giả lập bài viết này đang có 3 items: 501, 502, 503
    postService.selectPassPostItemsByPostId.mockResolvedValue([
      { id: 501 }, { id: 502 }, { id: 503 }
    ]);

    postService.deleteManyPassPostItems.mockResolvedValue(true);
  });

  // --- NHÓM 1: CÁC NHÁNH LỖI (ERROR BRANCHES) ---

  test('TCQLBV79: Kiểm tra việc thiếu postId - Expected 400', async () => {
    mockReq.params.postId = undefined;
    await removePassPostItems(mockReq, mockRes, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: StatusCodes.BAD_REQUEST }));
  });

  test('TCQLBV80: Bài viết không tồn tại - Expected 404', async () => {
    postService.selectPostById.mockResolvedValue([]);
    await removePassPostItems(mockReq, mockRes, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: StatusCodes.NOT_FOUND }));
  });

  test('TCQLBV81: Sai chủ sở hữu bài viết - Expected 403', async () => {
    postService.selectPostById.mockResolvedValue([{ id: 100, ownerId: 999 }]);
    await removePassPostItems(mockReq, mockRes, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: StatusCodes.FORBIDDEN }));
  });

  test('TCQLBV82: Bài viết không có bất kỳ item nào để xóa - Expected 404', async () => {
    postService.selectPassPostItemsByPostId.mockResolvedValue([]);
    await removePassPostItems(mockReq, mockRes, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ 
      statusCode: StatusCodes.NOT_FOUND 
    }));
  });

  // --- NHÓM 2: LOGIC XỬ LÝ QUERY PARAMS (QUERY HANDLING) ---

  test('TCQLBV83: passItemIds là một mảng (Array.isArray)', async () => {
    mockReq.query.passItemIds = ['501', '502', 'invalid']; // Có 1 giá trị không phải số
    
    await removePassPostItems(mockReq, mockRes, next);

    const deleteCalls = postService.deleteManyPassPostItems.mock.calls;
    // Kiểm tra đã filter các giá trị hợp lệ thuộc về bài viết
    expect(deleteCalls[0][1]).toEqual([501, 502]);
  });

  test('TCQLBV84: passItemIds là một giá trị đơn lẻ (String/Number)', async () => {
    mockReq.query.passItemIds = '503'; // Gửi lên 1 ID duy nhất
    
    await removePassPostItems(mockReq, mockRes, next);

    const deleteCalls = postService.deleteManyPassPostItems.mock.calls;
    expect(deleteCalls[0][1]).toEqual([503]);
  });

  // --- NHÓM 3: LOGIC FILTER BẢO MẬT (SECURITY FILTERING) ---

  test('TCQLBV85: Chỉ xóa những ID thực sự thuộc về bài viết (Filter logic)', async () => {
    // Người dùng gửi lên 501 (đúng) và 999 (ID của bài viết khác)
    mockReq.query.passItemIds = ['501', '999'];
    
    await removePassPostItems(mockReq, mockRes, next);

    const deleteCalls = postService.deleteManyPassPostItems.mock.calls;
    // Kết quả chỉ được phép xóa 501
    expect(deleteCalls[0][1]).toEqual([501]);
    expect(deleteCalls[0][1]).not.toContain(999);
  });

  test('TCQLBV86: Thành công trả về 200 và danh sách ID đã xóa', async () => {
    mockReq.query.passItemIds = ['501'];
    
    await removePassPostItems(mockReq, mockRes, next);

    expect(mockRes.send).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Delete post assets successfully',
      data: { removeIds: [501] }
    }));
  });
});