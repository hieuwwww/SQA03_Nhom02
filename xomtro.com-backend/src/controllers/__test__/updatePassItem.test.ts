jest.mock('@/models/schema', () => ({ __esModule: true }));

import { updatePassPostItem } from '@/controllers/post.controller';
import * as postService from '@/services/post.service';
import * as schemaHelper from '@/utils/schema.helper';
import * as constantsHelper from '@/utils/constants.helper';
import { StatusCodes } from 'http-status-codes';

// Mock tất cả dependencies
jest.mock('@/services/post.service');
jest.mock('@/utils/schema.helper');
jest.mock('@/utils/constants.helper', () => ({
  cleanObject: jest.fn((obj) => obj),
  generateSlug: jest.fn((val) => `slug-${val}`)
}));
jest.mock('@/utils/ApiResponse.helper', () => ({
  ApiResponse: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockReturnThis()
  }))
}));

describe('updatePassPostItem - Full Coverage Suite', () => {
  let mockReq: any;
  let mockRes: any;
  let next: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    next = jest.fn();
    mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn().mockReturnThis() };
    
    // Request mẫu
    mockReq = {
      params: { postId: '100', itemId: '500' },
      body: { passItemName: 'Item A', passItemPrice: 3000, passItemStatus: 'available' },
      currentUser: { users_detail: { userId: 1, role: 'user' } }
    };
  });

  // --- NHÓM 1: PHỦ NHÁNH LỖI ĐẦU VÀO (GUARD CLAUSES) ---

  test('TCQLBV65: Lỗi 400 khi thiếu postId hoặc itemId', async () => {
    mockReq.params.postId = undefined;
    await updatePassPostItem(mockReq, mockRes, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: StatusCodes.BAD_REQUEST }));
  });

  test('TCQLBV66: Lỗi 404 khi bài post không tồn tại', async () => {
    (postService.selectPostById as jest.Mock).mockResolvedValue([]);
    await updatePassPostItem(mockReq, mockRes, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: StatusCodes.NOT_FOUND }));
  });

  test('TCQLBV67: Lỗi 403 khi không phải chủ sở hữu bài post', async () => {
    (postService.selectPostById as jest.Mock).mockResolvedValue([{ id: 100, ownerId: 999 }]);
    await updatePassPostItem(mockReq, mockRes, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: StatusCodes.FORBIDDEN }));
  });

  test('TCQLBV68: Lỗi 404 khi itemId không thuộc về postId này', async () => {
    (postService.selectPostById as jest.Mock).mockResolvedValue([{ id: 100, ownerId: 1, type: 'pass' }]);
    (schemaHelper.checkUserAndPostPermission as jest.Mock).mockReturnValue(true);
    // Danh sách chỉ có item 501, nhưng request itemId là 500
    (postService.selectPassPostItemsByPostId as jest.Mock).mockResolvedValue([{ id: 501 }]);

    await updatePassPostItem(mockReq, mockRes, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: StatusCodes.NOT_FOUND }));
  });

  // --- NHÓM 2: PHỦ ĐIỀU KIỆN CON (LOGIC TÍNH GIÁ MIN/MAX) ---

  test('TCQLBV69: Tính lại priceStart (Min) khi giá mới thấp hơn tất cả giá cũ', async () => {
    (postService.selectPostById as jest.Mock).mockResolvedValue([{ id: 100, ownerId: 1, type: 'pass' }]);
    (schemaHelper.checkUserAndPostPermission as jest.Mock).mockReturnValue(true);
    
    // Giá cũ là 5000 và 7000. Giá mới truyền lên là 2000
    (postService.selectPassPostItemsByPostId as jest.Mock).mockResolvedValue([
      { id: 500, passItemPrice: 5000 },
      { id: 501, passItemPrice: 7000 }
    ]);
    mockReq.body.passItemPrice = 2000;

    await updatePassPostItem(mockReq, mockRes, next);

    const payload = (postService.updatePassPostByPostId as jest.Mock).mock.calls[0][1];
    expect(payload.priceStart).toBe(2000); // Min(5000, 7000, 2000)
    expect(payload.priceEnd).toBe(7000);   // Max(5000, 7000, 2000)
  });

  test('TCQLBV70: Tính lại priceEnd (Max) khi giá mới cao hơn tất cả giá cũ', async () => {
    (postService.selectPostById as jest.Mock).mockResolvedValue([{ id: 100, ownerId: 1, type: 'pass' }]);
    (schemaHelper.checkUserAndPostPermission as jest.Mock).mockReturnValue(true);
    
    (postService.selectPassPostItemsByPostId as jest.Mock).mockResolvedValue([
      { id: 500, passItemPrice: 5000 }
    ]);
    mockReq.body.passItemPrice = 10000;

    await updatePassPostItem(mockReq, mockRes, next);

    const payload = (postService.updatePassPostByPostId as jest.Mock).mock.calls[0][1];
    expect(payload.priceEnd).toBe(10000);
  });

  // --- NHÓM 3: PHỦ ĐIỀU KIỆN OPTIONAL PAYLOAD ---

  test('TCQLBV71: Không tạo slug nếu passItemName bị trống', async () => {
    (postService.selectPostById as jest.Mock).mockResolvedValue([{ id: 100, ownerId: 1, type: 'pass' }]);
    (schemaHelper.checkUserAndPostPermission as jest.Mock).mockReturnValue(true);
    (postService.selectPassPostItemsByPostId as jest.Mock).mockResolvedValue([{ id: 500, passItemPrice: 100 }]);
    
    mockReq.body.passItemName = undefined;

    await updatePassPostItem(mockReq, mockRes, next);

    const payload = (postService.updatePassPostItemById as jest.Mock).mock.calls[0][1];
    expect(payload.passItemNameSlug).toBeUndefined();
  });

  // --- NHÓM 4: THÀNH CÔNG (HAPPY PATH) ---

  test('TCQLBV72: Cập nhật thành công và trả về updatedId', async () => {
  // 1. Mock dữ liệu trả về với ID kiểu Number để khớp với Number(itemId)
  const postId = 100;
  const itemId = 500;
  
  (postService.selectPostById as jest.Mock).mockResolvedValue([{ 
    id: postId, 
    ownerId: 1, 
    type: 'pass' 
  }]);
  
  (schemaHelper.checkUserAndPostPermission as jest.Mock).mockReturnValue(true);
  
  // ĐẢM BẢO ID Ở ĐÂY LÀ NUMBER 500
  (postService.selectPassPostItemsByPostId as jest.Mock).mockResolvedValue([
    { id: itemId, passItemPrice: 2000 } 
  ]);

  (postService.updatePassPostItemById as jest.Mock).mockResolvedValue([1]);
  (postService.updatePassPostByPostId as jest.Mock).mockResolvedValue([1]);

  // 2. Chạy Controller
  await updatePassPostItem(mockReq, mockRes, next);

  // 3. DEBUG: Nếu vẫn fail, in lỗi mà controller bắt được ra console
  if (next.mock.calls.length > 0) {
    console.log("Controller error:", next.mock.calls[0][0]);
  }

  // 4. Kiểm chứng
  expect(postService.updatePassPostItemById).toHaveBeenCalledWith(itemId, expect.any(Object));
  expect(postService.updatePassPostByPostId).toHaveBeenCalledWith(postId, expect.any(Object));
  expect(mockRes.send).toHaveBeenCalled();
});
});