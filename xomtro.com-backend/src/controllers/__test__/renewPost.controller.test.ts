import { StatusCodes } from 'http-status-codes';
import { renewPost } from '../post.controller';
import { db } from '@/configs/database.config';
import { posts, users } from '@/models/schema';
import { eq } from 'drizzle-orm';
import ApiError from '@/utils/ApiError.helper';

describe('Unit Test: renewPost - REAL DB', () => {
  let mockRes: any;
  let next: any;

  const OWNER_ID = 8888;
  const POST_ID = 9999;

  // Khởi tạo dữ liệu mẫu
  const setupData = async () => {
    await db.delete(posts).where(eq(posts.id, POST_ID));
    await db.delete(users).where(eq(users.id, OWNER_ID));

    await db.insert(users).values({ id: OWNER_ID, name: 'Owner', email: 'renew@test.com', password: '123' });
    await db.insert(posts).values({
      id: POST_ID,
      title: 'Post cũ cần gia hạn',
      ownerId: OWNER_ID,
      type: 'rental',
      status: 'unactived', // Giả sử post đã hết hạn
      addressDistrict: 'Q1',
      addressProvince: 'HCM',
      addressWard: 'Đa Kao'
    });
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    next = jest.fn();
    await setupData();
  });

  afterEach(async () => {
    await db.delete(posts).where(eq(posts.id, POST_ID));
    await db.delete(users).where(eq(users.id, OWNER_ID));
  });

  // --- NHÁNH 1: THÀNH CÔNG VỚI CÁC ĐƠN VỊ THỜI GIAN ---

  test('TC_UNIT_QLBV_RENEW_1: Gia hạn theo đơn vị "hour"', async () => {
    const req = {
      currentUser: { users_detail: { userId: OWNER_ID, role: 'landlord' } },
      params: { postId: POST_ID.toString() },
      body: { expirationAfter: 5, expirationAfterUnit: 'hour' }
    } as any;

    await renewPost(req, mockRes, next);

    const response = mockRes.json.mock.calls[0][0];
    expect(response.statusCode).toBe(StatusCodes.OK);
    
    // Kiểm tra DB: Status phải thành 'actived'
    const [updatedPost] = await db.select().from(posts).where(eq(posts.id, POST_ID));
    expect(updatedPost.status).toBe('actived');
    expect(updatedPost.expirationAfterUnit).toBe('hour');
    expect(updatedPost.expirationTime?.getTime() - 5 * 60 * 60 * 1000).toBeCloseTo(updatedPost.updatedAt.getTime(), -3);
  }, 20000);

  test('TC_UNIT_QLBV_RENEW_2: Gia hạn theo đơn vị "week"', async () => {
    const req = {
      currentUser: { users_detail: { userId: OWNER_ID, role: 'landlord' } },
      params: { postId: POST_ID.toString() },
      body: { expirationAfter: 2, expirationAfterUnit: 'week' }
    } as any;

    await renewPost(req, mockRes, next);
    expect(mockRes.json).toHaveBeenCalled();

    const response = mockRes.json.mock.calls[0][0];
    expect(response.statusCode).toBe(StatusCodes.OK);
    
    // Kiểm tra DB: Status phải thành 'actived'
    const [updatedPost] = await db.select().from(posts).where(eq(posts.id, POST_ID));
    expect(updatedPost.status).toBe('actived');
    expect(updatedPost.expirationAfterUnit).toBe('week');
    expect(updatedPost.expirationTime?.getTime() - 2 * 7 * 24 * 60 * 60 * 1000).toBeCloseTo(updatedPost.updatedAt.getTime(), -3);
  }, 20000);

  test('TC_UNIT_QLBV_RENEW_3: Gia hạn vĩnh viễn (expirationAfter = 0 hoặc null)', async () => {
    const req = {
      currentUser: { users_detail: { userId: OWNER_ID, role: 'landlord' } },
      params: { postId: POST_ID.toString() },
      body: { expirationAfter: 0 } // Nhánh else if (!Number(expirationAfter))
    } as any;

    await renewPost(req, mockRes, next);
    const response = mockRes.json.mock.calls[0][0];
    expect(response.statusCode).toBe(StatusCodes.OK);

    const [updatedPost] = await db.select().from(posts).where(eq(posts.id, POST_ID));
    // Kiểm tra xem năm có phải là tương lai xa (ví dụ > 2100)
    expect(updatedPost.expirationTime?.getFullYear()).toBeCloseTo(2026+99);
  }, 20000);

  test('TC_UNIT_QLBV_RENEW_4: Gia hạn vĩnh viễn (expirationAfter là số âm)', async () => {
    const req = {
      currentUser: { users_detail: { userId: OWNER_ID, role: 'landlord' } },
      params: { postId: POST_ID.toString() },
      body: { expirationAfter: -1 } // Nhánh else if (!Number(expirationAfter))
    } as any;

    await renewPost(req, mockRes, next);
    const response = mockRes.json.mock.calls[0][0];
    expect(response.statusCode).toBe(StatusCodes.OK);

    const [updatedPost] = await db.select().from(posts).where(eq(posts.id, POST_ID));
    // Kiểm tra xem năm có phải là tương lai xa (ví dụ > 2100)
    expect(updatedPost.expirationTime?.getFullYear()).toBeCloseTo(2026+99);
  }, 20000);

  test('TC_UNIT_QLBV_RENEW_5: Gia hạn theo cho các bài viết hidden', async () => {
    // Đầu tiên, cập nhật trạng thái bài viết thành 'hidden'
    await db.update(posts).set({ status: 'hidden' }).where(eq(posts.id, POST_ID));
    const req = {
      currentUser: { users_detail: { userId: OWNER_ID, role: 'landlord' } },
      params: { postId: POST_ID.toString() },
      body: { expirationAfter: 5, expirationAfterUnit: 'hour' }
    } as any;

    await renewPost(req, mockRes, next);

    const response = mockRes.json.mock.calls[0][0];
    expect(response.statusCode).toBe(StatusCodes.OK);
    
    // Kiểm tra DB: Status phải thành 'actived'
    const [updatedPost] = await db.select().from(posts).where(eq(posts.id, POST_ID));
    expect(updatedPost.status).toBe('actived');
    expect(updatedPost.expirationAfterUnit).toBe('hour');
    expect(updatedPost.expirationTime?.getTime() - 5 * 60 * 60 * 1000).toBeCloseTo(updatedPost.updatedAt.getTime(), -3);
  }, 20000);

  test('TC_UNIT_QLBV_RENEW_6: Gia hạn cho các bài viết active', async () => {
    await db.update(posts).set({ status: 'actived' }).where(eq(posts.id, POST_ID));

    const req = {
      currentUser: { users_detail: { userId: OWNER_ID, role: 'landlord' } },
      params: { postId: POST_ID.toString() },
      body: { expirationAfter: 5, expirationAfterUnit: 'hour' }
    } as any;

    await renewPost(req, mockRes, next);

    const response = mockRes.json.mock.calls[0][0];
    expect(response.statusCode).toBe(StatusCodes.OK);
    
    // Kiểm tra DB: Status phải thành 'actived'
    const [updatedPost] = await db.select().from(posts).where(eq(posts.id, POST_ID));
    expect(updatedPost.status).toBe('actived');
    expect(updatedPost.expirationAfterUnit).toBe('hour');
    expect(updatedPost.expirationTime?.getTime() - 5 * 60 * 60 * 1000).toBeCloseTo(updatedPost.updatedAt.getTime(), -3);
  }, 20000);

  // --- NHÁNH 2: LỖI VALIDATION & PERMISSION ---

  test('TC_UNIT_QLBV_RENEW_7: Lỗi BAD_REQUEST khi postId không phải số nguyên an toàn', async () => {
    const req = {
      currentUser: { users_detail: { userId: OWNER_ID, role: 'landlord' } },
      params: { postId: '99999999999999999999' }, // Quá lớn so với Safe Integer
      body: { expirationAfter: 1 }
    } as any;

    await renewPost(req, mockRes, next);
    expect(next).toHaveBeenCalledWith(expect.any(ApiError));
    expect(next.mock.calls[0][0].statusCode).toBe(StatusCodes.BAD_REQUEST);
  }, 20000);

  test('TC_UNIT_QLBV_RENEW_8: Lỗi FORBIDDEN khi người khác cố tình gia hạn bài', async () => {
    const req = {
      currentUser: { users_detail: { userId: 21, role: 'landlord' } }, // Sai Owner
      params: { postId: POST_ID.toString() },
      body: { expirationAfter: 1 }
    } as any;

    await renewPost(req, mockRes, next);
    expect(next).toHaveBeenCalledWith(expect.any(ApiError));
    expect(next.mock.calls[0][0].statusCode).toBe(StatusCodes.FORBIDDEN);
  }, 20000);

  // --- NHÁNH 3: CATCH ERROR ---

  test('TC_UNIT_QLBV_RENEW_9: Phủ nhánh catch (TypeError)', async () => {
    const req = {
      currentUser: null, // Gây lỗi currentUser!
      params: { postId: POST_ID.toString() }
    } as any;

    await renewPost(req, mockRes, next);
    expect(next).toHaveBeenCalledWith(expect.any(TypeError));
  }, 20000);

  // --- NHÁNH 4: KIỂM THỬ ĐIỀU KIỆN BIÊN CỦA POST ID ---

  test('TC_UNIT_QLBV_RENEW_10: postId bị null hoặc undefined', async () => {
    const req = {
      currentUser: { users_detail: { userId: OWNER_ID, role: 'landlord' } },
      params: { postId: undefined }, // Giả lập trường hợp bị thiếu params trên URL
      body: { expirationAfter: 1 }
    } as any;

    await renewPost(req, mockRes, next);

    // KẾT QUẢ: Rơi vào nhánh if (!postId) -> 400 BAD_REQUEST
    expect(next).toHaveBeenCalledWith(expect.any(ApiError));
    expect(next.mock.calls[0][0].statusCode).toBe(StatusCodes.BAD_REQUEST);
  }, 20000);

  test('TC_UNIT_QLBV_RENEW_11: postId là chuỗi văn bản (NaN)', async () => {
    const req = {
      currentUser: { users_detail: { userId: OWNER_ID, role: 'landlord' } },
      params: { postId: 'bai-viet-cua-toi' }, // Truyền chữ thay vì số
      body: { expirationAfter: 1 }
    } as any;

    await renewPost(req, mockRes, next);

    // KẾT QUẢ: Number('bai-viet-cua-toi') là NaN -> 400 BAD_REQUEST
    // Vì !Number.isSafeInteger(NaN) trả về true
    expect(next).toHaveBeenCalledWith(expect.any(ApiError));
    expect(next.mock.calls[0][0].statusCode).toBe(StatusCodes.BAD_REQUEST);
  }, 20000);

  test('TC_UNIT_QLBV_RENEW_12: postId là số hợp lệ nhưng không tồn tại trong Database', async () => {
    const req = {
      currentUser: { users_detail: { userId: OWNER_ID, role: 'landlord' } },
      params: { postId: '999999' }, // ID này không có trong DB (vì sau setupData chỉ có ID 9999)
      body: { expirationAfter: 1 }
    } as any;

    await renewPost(req, mockRes, next);

    // KẾT QUẢ: existingPost.length sẽ là 0 -> 404 NOT_FOUND
    expect(next).toHaveBeenCalledWith(expect.any(ApiError));
    expect(next.mock.calls[0][0].statusCode).toBe(StatusCodes.NOT_FOUND);
  }, 20000);

  test('TC_UNIT_QLBV_RENEW_13: postId mang giá trị số âm', async () => {
    const req = {
      currentUser: { users_detail: { userId: OWNER_ID, role: 'landlord' } },
      params: { postId: '-1' },
      body: { expirationAfter: 1 }
    } as any;

    await renewPost(req, mockRes, next);

    // KẾT QUẢ: DB sẽ không tìm thấy bản ghi ID âm -> 404 NOT_FOUND
    expect(next).toHaveBeenCalledWith(expect.any(ApiError));
    expect(next.mock.calls[0][0].statusCode).toBe(StatusCodes.NOT_FOUND);
  }, 20000);

  // --- NHÁNH 5: KIỂM THỬ ĐIỀU KIỆN USER (SECURITY & AUTH) ---

  test('TC_UNIT_QLBV_RENEW_14: Lỗi khi currentUser bị null (Null Pointer Protection)', async () => {
    const req = {
      currentUser: null, // Giả lập lỗi middleware xác thực không truyền được user vào
      params: { postId: POST_ID.toString() },
      body: { expirationAfter: 1 }
    } as any;

    await renewPost(req, mockRes, next);

    // KẾT QUẢ: Code sẽ crash ở dòng currentUser! và nhảy vào catch(error) -> next(error)
    expect(next).toHaveBeenCalledWith(expect.any(TypeError));
  }, 20000);

  test('TC_UNIT_QLBV_RENEW_15: User có tồn tại nhưng sai Role (Forbidden Role)', async () => {
    const req = {
      currentUser: { 
        users_detail: { 
          userId: OWNER_ID, // Đúng chủ bài đăng
          role: 'guest'     // Nhưng Role 'guest' không có quyền gia hạn
        } 
      },
      params: { postId: POST_ID.toString() },
      body: { expirationAfter: 1 }
    } as any;

    await renewPost(req, mockRes, next);

    // KẾT QUẢ: Chặn bởi hàm checkUserAndPostPermission -> 403 FORBIDDEN
    expect(next).toHaveBeenCalledWith(expect.any(ApiError));
    expect(next.mock.calls[0][0].statusCode).toBe(StatusCodes.FORBIDDEN);
  }, 20000);

  test('TC_UNIT_QLBV_RENEW_16: Gia hạn với expirationAfter là chuỗi không phải số', async () => {
    const req = {
      currentUser: { users_detail: { userId: OWNER_ID, role: 'landlord' } },
      params: { postId: POST_ID.toString() },
      body: { expirationAfter: 'abc' } // Nhánh else if (!Number(expirationAfter))
    } as any;

    await renewPost(req, mockRes, next);
    expect(next).toHaveBeenCalled();

  }, 20000);


});