import { StatusCodes } from 'http-status-codes';
import { removePostAssets } from '../post.controller';
import { db } from '@/configs/database.config';
import { posts, postAssets, assets, users } from '@/models/schema';
import { eq, inArray, or } from 'drizzle-orm';
import ApiError from '@/utils/ApiError.helper';

describe('Unit Test: removePostAssets', () => {
    let mockRes: any;
    let next: any;

    const OWNER_ID = 7777;
    const POST_ID = 6666;
    const ASSET_ID_1 = 5001;
    const ASSET_ID_2 = 5002;
    const POST_ASSET_ID_1 = 4001;
    const POST_ASSET_ID_2 = 4002;

    const setupData = async () => {
        // Cleanup
        await db.delete(postAssets).where(eq(postAssets.postId, POST_ID));
        await db.delete(assets).where(inArray(assets.id, [ASSET_ID_1, ASSET_ID_2]));
        await db.delete(posts).where(eq(posts.id, POST_ID));
        await db.delete(users).where(eq(users.id, OWNER_ID));

        // Seed
        await db.insert(users).values({ id: OWNER_ID, name: 'Owner', email: 'test@gmail.com', password: '123' });
        await db.insert(posts).values({ id: POST_ID, title: 'Post test assets', ownerId: OWNER_ID, type: 'rental', addressDistrict: 'Cầu Giấy', addressProvince: 'Hà Nội', addressWard: 'Dịch Vọng' });
        await db.insert(assets).values([
            { id: ASSET_ID_1, postId: POST_ID, name: 'img1.jpg', url: 'url1' },
            { id: ASSET_ID_2, postId: POST_ID, name: 'img2.jpg', url: 'url2' }
        ]);
        await db.insert(postAssets).values([
            { id: POST_ASSET_ID_1, assetId: ASSET_ID_1, postId: POST_ID },
            { id: POST_ASSET_ID_2, assetId: ASSET_ID_2, postId: POST_ID }
        ]);
    };

    beforeEach(async () => {
        jest.clearAllMocks();
        mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
        next = jest.fn();
        await setupData();
    });

    afterEach(async () => {
        await db.delete(postAssets).where(eq(postAssets.postId, POST_ID));
        await db.delete(assets).where(inArray(assets.id, [ASSET_ID_1, ASSET_ID_2]));
        await db.delete(posts).where(eq(posts.id, POST_ID));
        await db.delete(users).where(eq(users.id, OWNER_ID));
    });

    // --- TEST BRANCHES ---

    test('TC_UNIT_QLBV_REMOVEPOSTASSETS_1: Xóa một mảng ID hợp lệ (Happy Path - Array Input)', async () => {
        const req = {
            currentUser: { users_detail: { userId: OWNER_ID, role: 'landlord' } },
            params: { postId: POST_ID },
            // Đảm bảo truyền đúng kiểu dữ liệu mà Controller mong đợi
            query: { assetIds: [ASSET_ID_1, ASSET_ID_2] }
        } as any;

        await removePostAssets(req, mockRes, next);

        // Kiểm tra xem next có bị gọi với lỗi không (để debug)
        if (next.mock.calls.length > 0) console.log(next.mock.calls[0][0]);

        const response = mockRes.json.mock.calls[0][0];
        expect(response.statusCode).toBe(StatusCodes.OK);

        // KIỂM TRA LẠI DB
        const assetsInDb = await db.select().from(assets).where(inArray(assets.id, [ASSET_ID_1, ASSET_ID_2]));
        expect(assetsInDb.length).toBe(0); // Cả 2 ảnh phải bị xóa

        const a=await db.select().from(assets).where(eq(assets.postId, POST_ID));
        console.log("Assets còn lại sau xóa:", a);
    });

    test('TC_UNIT_QLBV_REMOVEPOSTASSETS_2: Xóa chỉ một ID (Single Value Input)', async () => {
        const req = {
            currentUser: { users_detail: { userId: OWNER_ID, role: 'landlord' } },
            params: { postId: POST_ID.toString() },
            query: { assetIds: ASSET_ID_1.toString() } 
        } as any;

        await removePostAssets(req, mockRes, next);

        // BƯỚC QUAN TRỌNG: Nếu next bị gọi, nghĩa là có lỗi ném ra từ ApiError
        if (next.mock.calls.length > 0) {
            console.log("Lỗi thực tế từ Controller:", next.mock.calls[0][0]);
            // Dừng test tại đây và báo lỗi cụ thể
            throw next.mock.calls[0][0];
        }

        // Đảm bảo res.json đã được gọi
        expect(mockRes.json).toHaveBeenCalled();

        const response = mockRes.json.mock.calls[0][0];
        expect(response.statusCode).toBe(StatusCodes.OK);
        expect(response.data.removedIds).toContain(ASSET_ID_1);

        // KIỂM TRA LẠI DB: ASSET_ID_1 phải mất, ASSET_ID_2 vẫn còn
        const assetsInDb = await db.select().from(assets).where(inArray(assets.id, [ASSET_ID_1, ASSET_ID_2]));
        expect(assetsInDb.length).toBe(1);
        expect(assetsInDb[0].id).toBe(ASSET_ID_2);

        // Kiểm tra DB
        //const dbLinks = await db.select().from(postAssets).where(eq(postAssets.postId, POST_ID));
        //expect(dbLinks.length).toBe(1);
    });

    test('TC_UNIT_QLBV_REMOVEPOSTASSETS_3: Gửi ID không thuộc về Post (Filter logic)', async () => {
        const req = {
            currentUser: { users_detail: { userId: OWNER_ID, role: 'landlord' } },
            params: { postId: POST_ID.toString() },
            query: { assetIds: ['99999'] } // ID không tồn tại
        } as any;

        await removePostAssets(req, mockRes, next);

        const response = mockRes.json.mock.calls[0][0];
        // removedIds phải rỗng vì filter không khớp cái nào
        expect(response.data.removedIds).toEqual([]);

        const assetsInDb = await db.select().from(assets).where(inArray(assets.id, [ASSET_ID_1, ASSET_ID_2]));
        expect(assetsInDb.length).toBe(2); // DB vẫn nguyên 2 ảnh

        // DB vẫn nguyên 2 ảnh
        const dbLinks = await db.select().from(postAssets).where(eq(postAssets.postId, POST_ID));
        expect(dbLinks.length).toBe(2);
    });

    test('TC_UNIT_QLBV_REMOVEPOSTASSETS_4: Lỗi NOT_FOUND khi Post không có ảnh nào để xóa', async () => {
        // Xóa sạch ảnh trước khi gọi hàm
        await db.delete(postAssets).where(eq(postAssets.postId, POST_ID));

        const req = {
            currentUser: { users_detail: { userId: OWNER_ID, role: 'landlord' } },
            params: { postId: POST_ID.toString() },
            query: { assetIds: [ASSET_ID_1.toString()] }
        } as any;

        await removePostAssets(req, mockRes, next);

        expect(next).toHaveBeenCalledWith(expect.any(ApiError));
        expect(next.mock.calls[0][0].statusCode).toBe(StatusCodes.NOT_FOUND);
    });

    test('TC_UNIT_QLBV_REMOVEPOSTASSETS_5: Input assetIds chứa giá trị rác (NaN)', async () => {
        const req = {
            currentUser: { users_detail: { userId: OWNER_ID, role: 'landlord' } },
            params: { postId: POST_ID.toString() },
            query: { assetIds: ['abc', '-1'] }
        } as any;

        await removePostAssets(req, mockRes, next);

        const response = mockRes.json.mock.calls[0][0];
        expect(response.statusCode).toBe(StatusCodes.OK);
        // DB vẫn nguyên vì 'abc' bị filter NaN, -1 không khớp
        const dbLinks = await db.select().from(postAssets).where(eq(postAssets.postId, POST_ID));
        expect(dbLinks.length).toBe(2);
    });

    // --- NHÁNH 5: KIỂM THỬ USER (NULL, CHỮ, SAI ROLE) ---

  test('TC_UNIT_QLBV_REMOVEPOSTASSETS_6: Lỗi khi currentUser bị null (Null Pointer Check)', async () => {
    const req = {
      currentUser: null, // Giả lập lỗi middleware
      params: { postId: POST_ID.toString() },
      query: { assetIds: [POST_ASSET_ID_1.toString()] }
    } as any;

    await removePostAssets(req, mockRes, next);

    // Kết quả: Phải nhảy vào catch vì currentUser! gây lỗi TypeError
    expect(next).toHaveBeenCalledWith(expect.any(TypeError));
  });

  test('TC_UNIT_QLBV_REMOVEPOSTASSETS_7: userId là chữ hoặc không tồn tại trong hệ thống', async () => {
    await setupData();
    const req = {
      currentUser: { users_detail: { userId: 'HACKER_ID', role: 'landlord' } },
      params: { postId: POST_ID.toString() },
      query: { assetIds: [POST_ASSET_ID_1.toString()] }
    } as any;

    await removePostAssets(req, mockRes, next);

    // Kết quả: 'HACKER_ID' !== OWNER_ID (7777) -> 403 Forbidden
    expect(next).toHaveBeenCalledWith(expect.any(ApiError));
    expect(next.mock.calls[0][0].statusCode).toBe(StatusCodes.FORBIDDEN);
  });

  test('TC_UNIT_QLBV_REMOVEPOSTASSETS_8: Role sai (Không có quyền xóa assets)', async () => {
    const req = {
      currentUser: { users_detail: { userId: OWNER_ID, role: 'invalid_role' } },
      params: { postId: POST_ID.toString() },
      query: { assetIds: [POST_ASSET_ID_1.toString()] }
    } as any;

    await removePostAssets(req, mockRes, next);

    // Kết quả: Chặn bởi checkUserAndPostPermission -> 403 Forbidden
    expect(next).toHaveBeenCalledWith(expect.any(ApiError));
    expect(next.mock.calls[0][0].statusCode).toBe(StatusCodes.FORBIDDEN);
  });

  // --- NHÁNH 6: KIỂM THỬ POST ID (CHỮ, SỐ ÂM, KHÔNG TỒN TẠI) ---

  test('TC_UNIT_QLBV_REMOVEPOSTASSETS_9: postId là chữ (NaN)', async () => {
    const req = {
      currentUser: { users_detail: { userId: OWNER_ID, role: 'landlord' } },
      params: { postId: 'abc-xyz' },
      query: { assetIds: [POST_ASSET_ID_1.toString()] }
    } as any;

    await removePostAssets(req, mockRes, next);

    // Kết quả: Number('abc-xyz') là NaN -> selectPostById không tìm thấy -> 404
    expect(next).toHaveBeenCalledWith(expect.any(ApiError));
    expect(next.mock.calls[0][0].statusCode).toBe(StatusCodes.NOT_FOUND);
  });

  test('TC_UNIT_QLBV_REMOVEPOSTASSETS_10: postId là số âm', async () => {
    const req = {
      currentUser: { users_detail: { userId: OWNER_ID, role: 'landlord' } },
      params: { postId: '-99' },
      query: { assetIds: [POST_ASSET_ID_1.toString()] }
    } as any;

    await removePostAssets(req, mockRes, next);

    expect(next).toHaveBeenCalledWith(expect.any(ApiError));
    expect(next.mock.calls[0][0].statusCode).toBe(StatusCodes.NOT_FOUND);
  });

  // --- NHÁNH 7: KIỂM THỬ KHỐI CATCH (SYSTEM ERROR) ---

  test('TC_UNIT_QLBV_REMOVEPOSTASSETS_11: Phải gọi next(error) khi Database gặp sự cố bất ngờ', async () => {
    // 1. Giả lập một lỗi hệ thống cực nghiêm trọng (ví dụ: mất kết nối DB)
    // Chúng ta mock hàm selectPostById để nó ném ra lỗi
    const dbError = new Error('Database Connection Timeout');
    
    // Giả sử nhóm đang dùng spyOn hoặc mock cho các service/db
    // Ở đây tôi ví dụ mock trực tiếp hàm selectPostById nếu nó được export
    const postController = require('../post.controller'); 
    const spy = jest.spyOn(db, 'select').mockImplementationOnce(() => {
        throw dbError;
    });

    const req = {
      currentUser: { users_detail: { userId: OWNER_ID, role: 'landlord' } },
      params: { postId: POST_ID.toString() },
      query: { assetIds: [POST_ASSET_ID_1.toString()] }
    } as any;

    await removePostAssets(req, mockRes, next);

    // KẾT QUẢ MONG ĐỢI:
    // 1. next() phải được gọi
    expect(next).toHaveBeenCalled();
    
    // 2. Tham số truyền vào next phải chính là cái error chúng ta đã giả lập
    expect(next).toHaveBeenCalledWith(dbError);

    // 3. res.json không được phép gọi vì đã crash trước đó
    expect(mockRes.json).not.toHaveBeenCalled();

    // Dọn dẹp spy sau khi test xong
    spy.mockRestore();
  });
  
});