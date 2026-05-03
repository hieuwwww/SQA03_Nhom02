import { StatusCodes } from 'http-status-codes';
import { hiddenPostById } from '../post.controller'; // Điều chỉnh đường dẫn thực tế của nhóm
import { db } from '@/configs/database.config';
import { posts, users } from '@/models/schema';
import { eq, and, or } from 'drizzle-orm';
import ApiError from '@/utils/ApiError.helper';

describe('Unit Test: hiddenPostById', () => {
  let mockRes: any;
  let next: any;

  // Giả lập dữ liệu ID
  const OWNER_ID = 5555;
  const OTHER_USER_ID = 9999;
  const TEST_POST_ID = 8888;

  // Hàm setup dữ liệu dùng chung
  const setupPost = async (status: 'actived' | 'hidden', ownerId: number) => {
    // Xóa sạch trước khi chèn để tránh trùng lặp
    await db.delete(posts).where(eq(posts.id, TEST_POST_ID));
    await db.delete(users).where(eq(users.id, OWNER_ID));
    await db.delete(users).where(eq(users.id, OTHER_USER_ID));

    await db.insert(users).values({
      id: OWNER_ID,
      name: `Test User ${OWNER_ID}`,
      email: 'a@example.com',
      password: 'password'
    });

    await db.insert(users).values({
      id: OTHER_USER_ID,
      name: `Test User ${OTHER_USER_ID}`,
      email: 'b@example.com',
      password: 'password'
    });

    await db.insert(posts).values({
      id: TEST_POST_ID,
      title: 'Post Test Nhóm 6',
      content: 'Nội dung test',
      status: status,
      ownerId: ownerId,
      type: 'rental', // Giả sử dùng loại rental,
      addressProvince: 'Hà Nội',
      addressDistrict: 'Cầu Giấy',
      addressWard: 'Dịch Vọng'
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  afterEach(async () => {
    // Xóa sạch dữ liệu sau mỗi bài test để giữ DB sạch
    await db.delete(posts).where(eq(posts.id, TEST_POST_ID));
    await db.delete(users).where(eq(users.id, OWNER_ID));
    await db.delete(users).where(eq(users.id, OTHER_USER_ID));
  });

  // --- NHÁNH 1: THÀNH CÔNG (HAPPY PATH) ---

  test('TC_UNIT_QLBV_HIDDEN_1: Chuyển trạng thái từ ACTIVED sang HIDDEN thành công', async () => {
    await setupPost('actived', OWNER_ID);
    const req = {
      currentUser: { users_detail: { userId: OWNER_ID, role: 'landlord' } },
      params: { postId: TEST_POST_ID }
    } as any;

    await hiddenPostById(req, mockRes, next);

    const response = mockRes.json.mock.calls[0][0];
    expect(response.statusCode).toBe(200);
    expect(response.data.status).toBe('hidden');

    // Verify DB
    const [dbPost] = await db.select().from(posts).where(eq(posts.id, TEST_POST_ID));
    expect(dbPost.status).toBe('hidden');
  });


  test('TC_UNIT_QLBV_HIDDEN_2: Chuyển trạng thái ngược từ HIDDEN sang ACTIVED thành công', async () => {
    await setupPost('hidden', OWNER_ID);
    const req = {
      currentUser: { users_detail: { userId: OWNER_ID, role: 'landlord' } },
      params: { postId: TEST_POST_ID }
    } as any;

    await hiddenPostById(req, mockRes, next);

    const response = mockRes.json.mock.calls[0][0];
    expect(response.data.status).toBe('actived');

    // Verify DB
    const [dbPost] = await db.select().from(posts).where(eq(posts.id, TEST_POST_ID));
    expect(dbPost.status).toBe('actived');
  });

  // --- NHÁNH 2: BẢO MẬT & QUYỀN (SECURITY) ---

  test('TC_UNIT_QLBV_HIDDEN_3: Lỗi FORBIDDEN khi User A cố ẩn bài của User B (IDOR)', async () => {
    await setupPost('actived', OWNER_ID); // Bài của chủ 5555
    const req = {
      currentUser: { users_detail: { userId: OTHER_USER_ID, role: 'landlord' } }, // Người gọi là 9999
      params: { postId: TEST_POST_ID }
    } as any;

    await hiddenPostById(req, mockRes, next);

    expect(next).toHaveBeenCalledWith(expect.any(ApiError));
    const error = next.mock.calls[0][0];
    expect(error.statusCode).toBe(StatusCodes.FORBIDDEN);
  });

  test('TC_UNIT_QLBV_HIDDEN_4: Lỗi FORBIDDEN khi Role không có quyền (checkUserAndPostPermission)', async () => {
    await setupPost('actived', OWNER_ID);
    const req = {
      currentUser: { users_detail: { userId: OWNER_ID, role: 'invalid_role' } },
      params: { postId: TEST_POST_ID.toString() }
    } as any;

    await hiddenPostById(req, mockRes, next);

    expect(next).toHaveBeenCalledWith(expect.any(ApiError));
    expect(next.mock.calls[0][0].statusCode).toBe(StatusCodes.FORBIDDEN);
  });

  // --- NHÁNH 3: DỮ LIỆU LỖI & NGOẠI LỆ (EDGE CASES) ---

  test('TC_UNIT_QLBV_HIDDEN_5: Lỗi NOT_FOUND khi postId không tồn tại', async () => {
    const req = {
      currentUser: { users_detail: { userId: OWNER_ID, role: 'user' } },
      params: { postId: '999999' }
    } as any;

    await hiddenPostById(req, mockRes, next);

    expect(next).toHaveBeenCalledWith(expect.any(ApiError));
    expect(next.mock.calls[0][0].statusCode).toBe(StatusCodes.NOT_FOUND);
  });

  test('TC_UNIT_QLBV_HIDDEN_6: Xử lý lỗi khi postId là chữ (NaN)', async () => {
    const req = {
      currentUser: { users_detail: { userId: OWNER_ID, role: 'landlord' } },
      params: { postId: 'abc' }
    } as any;

    await hiddenPostById(req, mockRes, next);

    // SQL sẽ quăng lỗi vì không ép kiểu được hoặc không tìm thấy, nhảy vào catch
    expect(next).toHaveBeenCalled();
  });

  test('TC_UNIT_QLBV_HIDDEN_7: Lỗi BAD_REQUEST khi không truyền postId', async () => {
    const req = {
      currentUser: { users_detail: { userId: OWNER_ID, role: 'landlord' } },
      params: { postId: '' }
    } as any;

    await hiddenPostById(req, mockRes, next);

    expect(next).toHaveBeenCalledWith(expect.any(ApiError));
    expect(next.mock.calls[0][0].statusCode).toBe(StatusCodes.BAD_REQUEST);
  });

  // --- NHÁNH 4: KIỂM THỬ USER ID (TRONG CURRENTUSER) ---

  test('TC_UNIT_QLBV_HIDDEN_8: userId không tồn tại trong DB', async () => {
    await setupPost('actived', OWNER_ID); // Post thuộc về 5555
    const req = {
      currentUser: { users_detail: { userId: 999999, role: 'landlord' } }, // userId 999999 không tồn tại
      params: { postId: TEST_POST_ID }
    } as any;

    await hiddenPostById(req, mockRes, next);

    // KẾT QUẢ: Vì 999999 != 5555, hệ thống phải chặn lại ở nhánh Forbidden
    expect(next).toHaveBeenCalledWith(expect.any(ApiError));
    expect(next.mock.calls[0][0].statusCode).toBe(StatusCodes.FORBIDDEN);
  });

  test('TC_UNIT_QLBV_HIDDEN_9: userId là chữ (NaN) trong token/session', async () => {
    await setupPost('actived', OWNER_ID);
    const req = {
      currentUser: { users_detail: { userId: 'hacker-id', role: 'user' } }, // userId là chuỗi không hợp lệ
      params: { postId: TEST_POST_ID }
    } as any;

    await hiddenPostById(req, mockRes, next);

    // KẾT QUẢ: 'hacker-id' !== 5555 -> Trả về 403 Forbidden
    expect(next).toHaveBeenCalledWith(expect.any(ApiError));
    expect(next.mock.calls[0][0].statusCode).toBe(StatusCodes.FORBIDDEN);
  });

  test('TC_UNIT_QLBV_HIDDEN_10: userId là số âm', async () => {
    await setupPost('actived', OWNER_ID);
    const req = {
      currentUser: { users_detail: { userId: -1, role: 'landlord' } },
      params: { postId: TEST_POST_ID }
    } as any;

    await hiddenPostById(req, mockRes, next);

    // KẾT QUẢ: -1 !== 5555 -> Trả về 403 Forbidden
    expect(next).toHaveBeenCalledWith(expect.any(ApiError));
    expect(next.mock.calls[0][0].statusCode).toBe(StatusCodes.FORBIDDEN);
  });

});