import { StatusCodes } from 'http-status-codes';
import { removePostById } from '../post.controller';
import { db } from '@/configs/database.config';
import { posts, assets, postAssets, users } from '@/models/schema';
import { eq, inArray } from 'drizzle-orm';
import ApiError from '@/utils/ApiError.helper';

describe('Unit Test: removePostById', () => {
    let mockRes: any;
    let next: any;

    const OWNER_ID = 4444;
    const OTHER_USER_ID = 3333;
    const TEST_POST_ID = 2222;
    const ASSET1 = 9001;
    const ASSET2 = 9002;
    const POST_ASSET1 = 10001;
    const POST_ASSET2 = 10002;


    const setupPostWithAssets = async (ownerId: number) => {
        // THỨ TỰ XÓA: Phải xóa bảng con (N-N) trước rồi mới xóa bảng cha
        // Xóa liên kết Post-Assets trước
        await db.delete(postAssets).where(eq(postAssets.postId, TEST_POST_ID));

        // Xóa các Assets
        await db.delete(assets).where(
            inArray(assets.id, [ASSET1, ASSET2])
        );

        // Xóa Post
        await db.delete(posts).where(eq(posts.id, TEST_POST_ID));

        // Xóa Users
        await db.delete(users).where(
            inArray(users.id, [OWNER_ID, OTHER_USER_ID])
        );

        // --- THỨ TỰ CHÈN: Bảng cha trước, bảng con sau ---

        // 1. Chèn Users
        await db.insert(users).values([
            { id: OWNER_ID, name: `Owner User ${OWNER_ID}`, email: 'a@example.com', password: 'password' },
            { id: OTHER_USER_ID, name: `Other User ${OTHER_USER_ID}`, email: 'b@example.com', password: 'password' }
        ]);

        // 2. Chèn Post (Cần ownerId từ Users)
        await db.insert(posts).values({
            id: TEST_POST_ID,
            title: 'Post chuẩn bị xóa',
            ownerId: ownerId, // Phải là OWNER_ID hoặc OTHER_USER_ID
            type: 'rental',
            status: 'actived',
            addressDistrict: 'Cầu Giấy',
            addressProvince: 'Hà Nội',
            addressWard: 'Dịch Vọng'
        });

        // 3. Chèn Assets độc lập
        await db.insert(assets).values([
            { id: ASSET1, postId: TEST_POST_ID, name: 'image_1.jpg', url: 'url' },
            { id: ASSET2, postId: TEST_POST_ID, name: 'image_2.jpg', url: 'url2' }
        ]);

        // 4. Chèn liên kết (Cần postId và assetId)
        await db.insert(postAssets).values([
            { id: POST_ASSET1, assetId: ASSET1, postId: TEST_POST_ID },
            { id: POST_ASSET2, assetId: ASSET2, postId: TEST_POST_ID }
        ]);
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
        // Dọn dẹp sạch sẽ sau mỗi test
        await db.delete(postAssets).where(eq(postAssets.postId, TEST_POST_ID));
        await db.delete(assets).where(eq(assets.id, ASSET1));
        await db.delete(assets).where(eq(assets.id, ASSET2));
        await db.delete(posts).where(eq(posts.id, TEST_POST_ID));
        await db.delete(users).where(eq(users.id, OWNER_ID));
        await db.delete(users).where(eq(users.id, OTHER_USER_ID));
    });

    // --- NHÁNH 1: THÀNH CÔNG (HAPPY PATH) ---

    test('TC_UNIT_QLBV_REMOVEPOST_1: Xóa bài đăng và tài nguyên thành công', async () => {
        await setupPostWithAssets(OWNER_ID);
        const req = {
            currentUser: { users_detail: { userId: OWNER_ID, role: 'landlord' } },
            params: { postId: TEST_POST_ID.toString() }
        } as any;

        await removePostById(req, mockRes, next);

        const response = mockRes.json.mock.calls[0][0];
        expect(response.statusCode).toBe(200);
        expect(response.data.removedPostId).toBe(TEST_POST_ID);

        // KIỂM CHỨNG DB: Bản ghi phải mất hoàn toàn
        const [checkPost] = await db.select().from(posts).where(eq(posts.id, TEST_POST_ID));
        expect(checkPost).toBeUndefined();

        const checkPostAssets = await db.select().from(postAssets).where(eq(postAssets.postId, TEST_POST_ID));
        expect(checkPostAssets.length).toBe(0);

        const checkAssets = await db.select().from(assets).where(inArray(assets.id, [ASSET1, ASSET2]));
        expect(checkAssets.length).toBe(0);

    }, 20000); // Tăng timeout vì có thao tác DB thực tế, có thể mất thời gian hơn bình thường

    // --- NHÁNH 2: BẢO MẬT (SECURITY & PERMISSION) ---

    test('TC_UNIT_QLBV_REMOVEPOST_2: Lỗi FORBIDDEN khi User cố xóa bài của người khác', async () => {
        await setupPostWithAssets(OWNER_ID);
        const req = {
            currentUser: { users_detail: { userId: OTHER_USER_ID, role: 'landlord' } },
            params: { postId: TEST_POST_ID.toString() }
        } as any;

        await removePostById(req, mockRes, next);

        expect(next).toHaveBeenCalledWith(expect.any(ApiError));
        expect(next.mock.calls[0][0].statusCode).toBe(StatusCodes.FORBIDDEN);
    }, 20000);

    // --- NHÁNH 3: DỮ LIỆU LỖI (INVALID DATA) ---

    test('TC_UNIT_QLBV_REMOVEPOST_3: Lỗi NOT_FOUND khi postId không tồn tại', async () => {
        const req = {
            currentUser: { users_detail: { userId: OWNER_ID, role: 'landlord' } },
            params: { postId: '999999' }
        } as any;

        await removePostById(req, mockRes, next);

        expect(next).toHaveBeenCalledWith(expect.any(ApiError));
        expect(next.mock.calls[0][0].statusCode).toBe(StatusCodes.NOT_FOUND);
    }, 20000);

    test('TC_UNIT_QLBV_REMOVEPOST_4: Lỗi BAD_REQUEST khi postId bị trống', async () => {
        const req = {
            currentUser: { users_detail: { userId: OWNER_ID, role: 'landlord' } },
            params: { postId: '' }
        } as any;

        await removePostById(req, mockRes, next);

        expect(next).toHaveBeenCalledWith(expect.any(ApiError));
        expect(next.mock.calls[0][0].statusCode).toBe(StatusCodes.BAD_REQUEST);
    }, 20000);

    test('TC_UNIT_QLBV_REMOVEPOST_5: Xử lý khi postId là chữ hoặc số âm', async () => {
        const req = {
            currentUser: { users_detail: { userId: OWNER_ID, role: 'landlord' } },
            params: { postId: 'abc' }
        } as any;

        await removePostById(req, mockRes, next);
        // Nhảy vào catch do lỗi ép kiểu Number hoặc SQL
        expect(next).toHaveBeenCalled();
    }, 10000);


    // --- NHÁNH 4: KIỂM THỬ ĐIỀU KIỆN USER & ROLE ---

    test('TC_UNIT_QLBV_REMOVEPOST_6: userId của người xóa không tồn tại trong hệ thống', async () => {
        // Post này thuộc về OWNER_ID (4444)
        await setupPostWithAssets(OWNER_ID);

        const req = {
            currentUser: {
                users_detail: {
                    userId: 999999, // Một ID không có trong bảng users
                    role: 'user'
                }
            },
            params: { postId: TEST_POST_ID.toString() }
        } as any;

        await removePostById(req, mockRes, next);

        // KẾT QUẢ: Hệ thống so sánh 999999 !== 4444 -> Trả về 403 Forbidden
        expect(next).toHaveBeenCalledWith(expect.any(ApiError));
        expect(next.mock.calls[0][0].statusCode).toBe(StatusCodes.FORBIDDEN);
    }, 20000);

    test('TC_UNIT_QLBV_REMOVEPOST_7: Role không hợp lệ (không có quyền xóa loại post này)', async () => {
        await setupPostWithAssets(OWNER_ID);

        const req = {
            currentUser: {
                users_detail: {
                    userId: OWNER_ID, // Đúng chủ sở hữu
                    role: 'guest'     // Nhưng Role 'guest' bị chặn bởi hàm checkUserAndPostPermission
                }
            },
            params: { postId: TEST_POST_ID.toString() }
        } as any;

        await removePostById(req, mockRes, next);

        // KẾT QUẢ: Bị chặn ở nhánh if (!checkUserAndPostPermission(...))
        expect(next).toHaveBeenCalledWith(expect.any(ApiError));
        expect(next.mock.calls[0][0].statusCode).toBe(StatusCodes.FORBIDDEN);
    }, 20000);

    test('TC_UNIT_QLBV_REMOVEPOST_8: userId trong currentUser mang giá trị rác (chữ/số âm)', async () => {
        await setupPostWithAssets(OWNER_ID);

        const req = {
            currentUser: {
                users_detail: {
                    userId: -1, // Số âm
                    role: 'landlord'
                }
            },
            params: { postId: TEST_POST_ID.toString() }
        } as any;

        await removePostById(req, mockRes, next);

        // KẾT QUẢ: Vẫn là 403 vì -1 không bao giờ bằng OWNER_ID (4444)
        expect(next).toHaveBeenCalledWith(expect.any(ApiError));
        expect(next.mock.calls[0][0].statusCode).toBe(StatusCodes.FORBIDDEN);
    },10000);

    test('TC_UNIT_QLBV_REMOVEPOST_9: Xóa cùng một bài đăng 2 lần liên tiếp', async () => {
        await setupPostWithAssets(OWNER_ID);
        const req = {
            currentUser: { users_detail: { userId: OWNER_ID, role: 'landlord' } },
            params: { postId: TEST_POST_ID.toString() }
        } as any;

        // LẦN 1
        await removePostById(req, mockRes, next);

        if (next.mock.calls.length > 0) {
            console.log("Lỗi lần 1:", next.mock.calls[0][0]);
        }
        expect(mockRes.json).toHaveBeenCalled(); // Nếu lỗi ở đây, hãy xem log bên trên

        // LẦN 2
        jest.clearAllMocks();
        const next2 = jest.fn();
        await removePostById(req, mockRes, next2);
        expect(next2).toHaveBeenCalledWith(expect.objectContaining({
            statusCode: StatusCodes.NOT_FOUND
        }));
    }, 10000);


    
      test('TC_UNIT_QLBV_REMOVEPOST_10: Phải gọi next(error) khi Database gặp sự cố bất ngờ', async () => {
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
          params: { postId: TEST_POST_ID.toString() },
        } as any;
    
        await removePostById(req, mockRes, next);
    
        // KẾT QUẢ MONG ĐỢI:
        // 1. next() phải được gọi
        expect(next).toHaveBeenCalled();
        
        // 2. Tham số truyền vào next phải chính là cái error chúng ta đã giả lập
        expect(next).toHaveBeenCalledWith(dbError);
    
        // 3. res.json không được phép gọi vì đã crash trước đó
        expect(mockRes.json).not.toHaveBeenCalled();
    
        // Dọn dẹp spy sau khi test xong
        spy.mockRestore();
      },20000);

});