import { eq, and } from 'drizzle-orm';
import { StatusCodes } from 'http-status-codes';
import { removeUserPostInterested } from '../post.controller';
import { db } from '@/configs/database.config';
import { users, posts, userPostsInterested } from '@/models/schema';
import ApiError from '@/utils/ApiError.helper';

describe('Unit Test: removeUserPostInterested', () => {
    let mockRes: any;
    let next: any;
    const TEST_USER_ID = 7777;
    const TEST_POST_ID = 6666;

    beforeEach(async () => {
        // Dọn dẹp
        await db.delete(userPostsInterested).where(eq(userPostsInterested.userId, TEST_USER_ID));
        await db.delete(posts).where(eq(posts.id, TEST_POST_ID));
        await db.delete(users).where(eq(users.id, TEST_USER_ID));

        // 2. Tạo dữ liệu thật trong DB
        await db.insert(users).values({
            id: TEST_USER_ID,
            fullName: 'QA Tester Manual Clean',
            email: 'qa_manual@gmail.com',
            password: 'password123'
        });

        await db.insert(posts).values({
            id: TEST_POST_ID,
            title: 'Phòng trọ Test Manual',
            addressProvince: 'Hà Nội',
            addressDistrict: 'Cầu Giấy',
            addressWard: 'Dịch Vọng',
            type: 'rental',
            status: 'actived'
        });

        // Tạo sẵn một bản ghi quan tâm để lát nữa xóa
        await db.insert(userPostsInterested).values({
            userId: TEST_USER_ID,
            postId: TEST_POST_ID
        });
    });

    afterEach(async () => {
        await db.delete(userPostsInterested).where(eq(userPostsInterested.userId, TEST_USER_ID));
        await db.delete(posts).where(eq(posts.id, TEST_POST_ID));
        await db.delete(users).where(eq(users.id, TEST_USER_ID));
    });

    beforeEach(() => {
        mockRes = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis(),
        };
        next = jest.fn();
    });

    test('TC_UNIT_QLBVDL_REMOVEINTEREST_1: Huỷ quan tâm bài viết thành công', async () => {
        const req = {
            currentUser: { users: { id: TEST_USER_ID } },
            params: { postId: TEST_POST_ID }
        } as any;

        await removeUserPostInterested(req, mockRes, next);

        const response = mockRes.json.mock.calls[0][0];
        expect(response.statusCode).toBe(StatusCodes.OK);

        // Kiểm chứng DB: Bản ghi không còn tồn tại
        const check = await db.select().from(userPostsInterested).where(
            and(
                eq(userPostsInterested.userId, TEST_USER_ID),
                eq(userPostsInterested.postId, TEST_POST_ID)
            )
        );
        expect(check.length).toBe(0);
    });


    test('TC_UNIT_QLBVDL_REMOVEINTEREST_2: Lỗi khi huỷ quan tâm một bài chưa từng nhấn thích', async () => {
        const req = {
            currentUser: { users: { id: TEST_USER_ID } },
            params: { postId: 999999 } // ID bài viết chưa từng quan tâm
        } as any;

        await removeUserPostInterested(req, mockRes, next);

        // Phải nhảy vào catch và gọi next với ApiError 400
        expect(next).toHaveBeenCalledWith(expect.any(ApiError));
        const error = next.mock.calls[0][0];
        expect(error.statusCode).toBe(StatusCodes.BAD_REQUEST);
    });

    test('TC_UNIT_QLBVDL_REMOVEINTEREST_3: Lỗi khi không truyền postId lên params', async () => {
        const req = {
            currentUser: { users: { id: TEST_USER_ID } },
            params: { postId: null } // Trống
        } as any;

        await removeUserPostInterested(req, mockRes, next);

        expect(next).toHaveBeenCalledWith(expect.any(ApiError));
        const error = next.mock.calls[0][0];
        expect(error.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
    });

    test('TC_UNIT_QLBVDL_REMOVEINTEREST_4: Xử lý khi postId là chữ (NaN)', async () => {
        const req = {
            currentUser: { users: { id: TEST_USER_ID } },
            params: { postId: 'malicious_string' }
        } as any;

        await removeUserPostInterested(req, mockRes, next);

        // Thường sẽ nhảy vào catch do lỗi SQL hoặc select trả về []
        expect(next).toHaveBeenCalled();
    });

    test('TC_UNIT_QLBVDL_REMOVEINTEREST_5: Security - User A không được phép xóa bài quan tâm của User B', async () => {
        const USER_A_ID = 7777;
        const USER_B_ID = 8888;
        const TARGET_POST_ID = 6666;

        // --- BẮT BUỘC: Đảm bảo hiện trường sạch sẽ trước khi test ---
        await db.delete(userPostsInterested).where(eq(userPostsInterested.postId, TARGET_POST_ID));
        await db.delete(users).where(eq(users.id, USER_B_ID));

        // Tạo User B
        await db.insert(users).values({
            id: USER_B_ID,
            fullName: 'User B',
            email: 'user_b@gmail.com',
            password: 'password456'
        });

        // 1. CHUẨN BỊ: Bản ghi này thuộc về USER B
        await db.insert(userPostsInterested).values({
            userId: USER_B_ID,
            postId: TARGET_POST_ID
        });

        // 2. THỰC THI: User A (7777) cố xóa bài của User B (8888)
        const req = {
            currentUser: { users: { id: USER_A_ID } },
            params: { postId: TARGET_POST_ID }
        } as any;

        await removeUserPostInterested(req, mockRes, next);

        // 3. KIỂM TRA: 
        // Nếu code đúng, 'existingUserPostInterested' sẽ rỗng (vì post 6666 không thuộc về user 7777)
        // Sau đó throw ApiError(400) -> gọi next()

        if (next.mock.calls.length === 0) {
            // Nếu chui vào đây nghĩa là test bị FAIL do code chạy xuống 200 OK
            const successCall = mockRes.json.mock.calls[0][0];
            console.log('Lỗi bảo mật! Code trả về 200 thay vì 400:', successCall);
        }

        expect(next).toHaveBeenCalledWith(expect.any(ApiError));
        const error = next.mock.calls[0][0];
        expect(error.statusCode).toBe(400);

        // 4. KIỂM TRA DB: Bản ghi của User B vẫn phải còn đó
        const recordInDb = await db.select().from(userPostsInterested).where(
            and(eq(userPostsInterested.userId, USER_B_ID), eq(userPostsInterested.postId, TARGET_POST_ID))
        );
        expect(recordInDb.length).toBe(1);

        await db.delete(userPostsInterested).where(eq(userPostsInterested.postId, TARGET_POST_ID));
        await db.delete(users).where(eq(users.id, USER_B_ID));
    });

    test('TC_UNIT_QLBVDL_REMOVEINTEREST_6: Xóa lặp lại cùng một bài quan tâm lần thứ 2', async () => {
        const TEST_USER_ID = 7777;
        const TEST_POST_ID = 6666;

        // --- LẦN 1: Xóa thành công ---
        const req1 = {
            currentUser: { users: { id: TEST_USER_ID } },
            params: { postId: TEST_POST_ID }
        } as any;

        await removeUserPostInterested(req1, mockRes, next);
        expect(mockRes.status).toHaveBeenCalledWith(200);

        // Reset mock để chuẩn bị cho lần gọi thứ 2
        jest.clearAllMocks();
        const next2 = jest.fn();

        // --- LẦN 2: Gửi lại request y hệt ---
        await removeUserPostInterested(req1, mockRes, next2);

        // KẾT QUẢ MONG ĐỢI: 
        // Vì lần 1 đã xóa rồi, lần 2 'existingUserPostInterested.length' sẽ là 0
        // Hệ thống phải ném lỗi 400 (BAD_REQUEST)
        expect(next2).toHaveBeenCalledWith(expect.any(ApiError));
        const error = next2.mock.calls[0][0];
        expect(error.statusCode).toBe(StatusCodes.BAD_REQUEST);
    });

    test('TC_UNIT_QLBVDL_REMOVEINTEREST_7: currentUser bị null', async () => {
        const req = {
            currentUser: null, // Giả lập lỗi Auth
            params: { postId: 6666 }
        } as any;

        await removeUserPostInterested(req, mockRes, next);

        // KẾT QUẢ MONG ĐỢI: 
        // Hệ thống phải bắt được lỗi TypeError và đẩy vào hàm next() 
        // để tránh làm sập server
        expect(next).toHaveBeenCalledWith(expect.any(Error));
        const error = next.mock.calls[0][0];
        expect(error instanceof TypeError).toBe(true);
    });

});

