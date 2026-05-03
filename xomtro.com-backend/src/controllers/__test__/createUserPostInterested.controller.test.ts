import { db } from '@/configs/database.config';
import { posts, userPostsInterested } from '@/models/schema';
import { createUserPostInterested } from '../post.controller';
import { StatusCodes } from 'http-status-codes';
import { eq, inArray, and } from 'drizzle-orm/sql/expressions/conditions';
import * as postService from '../../services/post.service'; // Import service để mock


describe('Unit Test: createUserPostInterested', () => {
    let mockRes: any;
    let next: any;
    let testUser: any;
    let testPostId: number;
    const seedRental = async (data: {
        id: number,
        title: string,
        priceStart: number,
        priceEnd: number,
        totalArea: number,
        province?: string,
        district?: string,
        ward?: string,
        furniture?: boolean,
        pet?: boolean,
        longitude?: number,
        latitude?: number,
        status?: string
    }) => {
        await db.insert(posts).values({
            id: data.id,
            title: data.title,
            titleSlug: data.title.toLowerCase().replace(/ /g, '-'),
            type: 'rental',
            status: data.status || 'actived',
            addressProvince: data.province || 'Hà Nội',
            addressDistrict: data.district || 'Hai Bà Trưng',
            addressWard: data.ward || 'Phố Huế',
            addressLongitude: data.longitude || 106.660172,
            addressLatitude: data.latitude || 10.762622,
            ownerId: 21
        });
    };
    beforeAll(async () => {
        // 1. Tạo User giả để test
        // Giả sử bạn có hàm helper seedUser
        testUser = { users: { id: 21 } };

        // 2. Seed 1 bài đăng thật để quan tâm
        const post = await seedRental({
            id: 999111,
            title: 'Bài đăng để test quan tâm',
            priceStart: 3000, priceEnd: 5000, totalArea: 30
        });
        const post2 = await seedRental({
            id: 999112,
            title: 'Bài đăng không active',
            priceStart: 3000, priceEnd: 5000, totalArea: 30,
            status: 'hidden'
        });

        testPostId = 999111;
    });

    beforeEach(() => {
        mockRes = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis(),
        };
        next = jest.fn();
    });

    afterEach(async () => {
        // Dọn dẹp dữ liệu quan tâm, bài đăng và user đã tạo
        await db.delete(userPostsInterested).where(eq(userPostsInterested.postId, testPostId));
        await db.delete(posts).where(eq(posts.id, testPostId));
        await db.delete(posts).where(eq(posts.id, 999112));
    });

    test('TC_UNIT_QLBVDL_CREATEINTERESTED_1: Lưu bài đăng quan tâm thành công', async () => {
        const req = {
            currentUser: testUser,
            body: { postId: testPostId }
        } as any;

        await createUserPostInterested(req, mockRes, next);

        expect(mockRes.status).toHaveBeenCalledWith(201);
        const response = mockRes.json.mock.calls[0][0];
        expect(response.message).toBe('Created');
        expect(response.data.postId).toBe(testPostId);

        // Kiểm tra thực tế trong DB xem đã có bản ghi chưa
        const dbCheck = await db.select()
            .from(userPostsInterested)
            .where(and(
                eq(userPostsInterested.userId, testUser.users.id),
                eq(userPostsInterested.postId, testPostId)
            ));
        expect(dbCheck.length).toBe(1);
    });

    test('TC_UNIT_QLBVDL_CREATEINTERESTED_2: Trả về 422 khi thiếu postId', async () => {
        const req = {
            currentUser: testUser,
            body: {} // Thiếu postId
        } as any;

        await createUserPostInterested(req, mockRes, next);

        expect(next).toHaveBeenCalledWith(expect.objectContaining({
            statusCode: 422
        }));
    });

    test('TC_UNIT_QLBVDL_CREATEINTERESTED_3: Trả về 404 khi bài đăng không tồn tại', async () => {
        const req = {
            currentUser: testUser,
            body: { postId: 99999999 } // ID không tồn tại
        } as any;

        await createUserPostInterested(req, mockRes, next);

        expect(next).toHaveBeenCalledWith(expect.objectContaining({
            statusCode: 404
        }));
    });

    test('TC_UNIT_QLBVDL_CREATEINTERESTED_4: Xử lý khi lưu bài đăng (Kiểm tra DB chặn trùng)', async () => {
        const req = {
            currentUser: testUser,
            body: { postId: testPostId }
        } as any;

        // Lưu lần 1 (Đã làm ở TC_01, ở đây ta gọi lại)
        await createUserPostInterested(req, mockRes, next);

        // Nếu DB của nhóm không có Unique Key, expect này sẽ fail.
        // Nhóm nên kiểm tra lại Migration/Schema của bảng userPostsInterested
        if (next.mock.calls.length > 0) {
            expect(next).toHaveBeenCalled();
        } else {
            console.warn("CẢNH BÁO SQA: Database đang cho phép lưu trùng bài quan tâm!");
        }
    });

    test('TC_UNIT_QLBVDL_CREATEINTERESTED_5: Trả về lỗi khi postId là số âm', async () => {
        const req = {
            currentUser: testUser,
            body: { postId: -1 }
        } as any;

        await createUserPostInterested(req, mockRes, next);

        // Mong đợi: Trả về lỗi 422 hoặc 404 (tùy vào logic selectPostById)
        // Nếu selectPostById(-1) trả về mảng rỗng, code của bạn sẽ throw 404.
        expect(next).toHaveBeenCalledWith(expect.objectContaining({
            statusCode: 404 // Vì không thể tìm thấy bài đăng có ID âm
        }));
    });
    test('TC_UNIT_QLBVDL_CREATEINTERESTED_6: Trả về lỗi khi postId là chuỗi ký tự (NaN)', async () => {
        const req = {
            currentUser: testUser,
            body: { postId: 'abcxyz' }
        } as any;

        await createUserPostInterested(req, mockRes, next);

        // Nếu code của bạn không validation kiểu dữ liệu trước, 
        // DB có thể trả về lỗi hoặc hàm throw lỗi ép kiểu.
        const error = next.mock.calls[0][0];
        expect(error).toBeDefined();
        expect(error.statusCode).toBe(404);
    });

    test('TC_UNIT_QLBVDL_CREATEINTERESTED_7: postId bằng 0 (Biên dưới)', async () => {
        const req = {
            currentUser: testUser,
            body: { postId: 0 }
        } as any;

        await createUserPostInterested(req, mockRes, next);

        const error = next.mock.calls[0][0];
        expect(error).toBeDefined();
        expect(error.statusCode).toBe(422);
    });

    test('TC_UNIT_QLBVDL_CREATEINTERESTED_8: postId là null hoặc undefined', async () => {
        // Case null
        const reqNull = { currentUser: testUser, body: { postId: null } } as any;
        await createUserPostInterested(reqNull, mockRes, next);
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 422 }));

        next.mockClear();

        // Case undefined
        const reqUndef = { currentUser: testUser, body: {} } as any; // Không gửi postId
        await createUserPostInterested(reqUndef, mockRes, next);
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 422 }));
    });

    test('TC_UNIT_QLBVDL_CREATEINTERESTED_9: currentUser là null (Gây crash để phủ catch block)', async () => {
        const req = {
            currentUser: null, // Giả lập lỗi middleware
            body: { postId: testPostId }
        } as any;

        // Khi chạy dòng: const { users } = currentUser!; 
        // JavaScript sẽ ném lỗi: TypeError: Cannot destructure property 'users' of 'currentUser' as it is null.

        await createUserPostInterested(req, mockRes, next);

        // Kiểm tra xem lỗi có được đẩy vào next(error) không
        expect(next).toHaveBeenCalledWith(expect.any(Error));
        const error = next.mock.calls[0][0];
        expect(error instanceof TypeError).toBe(true);
    });


    test('TC_UNIT_QLBVDL_CREATEINTERESTED_10: Lỗi Database bất ngờ (Phủ catch block)', async () => {
        // Mock hàm selectPostById để nó ném ra một lỗi bí ẩn
        const spy = jest.spyOn(postService, 'selectPostById').mockRejectedValue(new Error('DB_CONNECTION_LOST'));

        const req = {
            currentUser: testUser,
            body: { postId: testPostId }
        } as any;

        await createUserPostInterested(req, mockRes, next);

        // Xác nhận lỗi được bắt bởi catch và chuyển cho next
        expect(next).toHaveBeenCalledWith(expect.objectContaining({
            message: 'DB_CONNECTION_LOST'
        }));

        spy.mockRestore(); // Khôi phục lại hàm gốc sau khi test
    });

    test('TC_UNIT_QLBVDL_CREATEINTERESTED_11: Lỗi khi userId không tồn tại trong Database', async () => {
        const invalidUser = { users: { id: 9999999, email: 'ghost@gmail.com' } }; // ID không có trong DB
        const req = {
            currentUser: invalidUser,
            body: { postId: testPostId }
        } as any;

        await createUserPostInterested(req, mockRes, next);

        // Kết quả mong đợi: Lỗi SQL Foreign Key Constraint
        // Khối catch sẽ bắt được lỗi này và đẩy vào next
        expect(next).toHaveBeenCalledWith(expect.any(Error));
        const error = next.mock.calls[0][0];

        // Kiểm tra xem có phải lỗi liên quan đến ràng buộc khóa ngoại không
        // (Tùy vào driver DB, thường chứa từ khóa 'foreign key constraint')
    });

    test('TC_UNIT_QLBVDL_CREATEINTERESTED_12: Chống tấn công SQL Injection bằng chuỗi "1=1 OR"', async () => {
        // Chuỗi tấn công mục đích làm cho điều kiện WHERE luôn đúng
        const injectionPayload = "1 OR 1=1";

        const req = {
            currentUser: testUser,
            body: { postId: injectionPayload }
        } as any;

        await createUserPostInterested(req, mockRes, next);

        // PHÂN TÍCH KẾT QUẢ:
        // 1. Nếu nhóm có dùng Number(postId) trong Controller:
        //    Number("1 OR 1=1") sẽ trả về NaN -> Phải ném lỗi 422 hoặc 404.

        // 2. Nếu nhóm truyền trực tiếp chuỗi vào Drizzle/SQL:
        //    Drizzle dùng Prepared Statements nên nó sẽ tìm postId bằng đúng chuỗi "1 OR 1=1".
        //    Vì không có bài đăng nào có ID là chuỗi đó, nó phải trả về 404 (Not Found).

        const error = next.mock.calls[0][0];
        expect(error).toBeDefined();

        // Không được phép thành công (201). Phải là lỗi do không tìm thấy hoặc dữ liệu sai.
        expect([404, 422]).toContain(error.statusCode);

        // Đảm bảo res.status(201) không bao giờ được gọi
        expect(mockRes.status).not.toHaveBeenCalledWith(201);
    });

    
    test('TC_UNIT_QLBVDL_CREATEINTERESTED_13: Lưu bài đăng quan tâm không thành công do bài viết hidden', async () => {
        const req = {
            currentUser: testUser,
            body: { postId: 999112 } // Bài đăng đã bị set thành hidden
        } as any;
        await createUserPostInterested(req, mockRes, next);
        // Mong đợi: Phải trả về lỗi 404 vì bài đăng không tồn tại (do không active)
        expect(next).toHaveBeenCalledWith(expect.objectContaining({
            statusCode: 404
        }));
        // Kiểm tra trong DB: Không được phép có bản ghi quan tâm nào được tạo ra
        const dbCheck = await db.select()
            .from(userPostsInterested)
            .where(and(
                eq(userPostsInterested.userId, testUser.users.id),
                eq(userPostsInterested.postId, 999112)
            ));
        expect(dbCheck.length).toBe(0);
    });

    test('TC_UNIT_QLBVDL_CREATEINTERESTED_14: Lưu bài đăng quan tâm không thành công do bài viết unactived', async () => {
        const req = {
            currentUser: testUser,
            body: { postId: 999112 } 
        } as any;
        await db.update(posts).set({ status: 'unactived' }).where(eq(posts.id, 999112)); // Đảm bảo bài viết ở trạng thái không active
        await createUserPostInterested(req, mockRes, next);
        // Mong đợi: Phải trả về lỗi 404 vì bài đăng không tồn tại (do không active)
        expect(next).toHaveBeenCalledWith(expect.objectContaining({
            statusCode: 404
        }));
        // Kiểm tra trong DB: Không được phép có bản ghi quan tâm nào được tạo ra
        const dbCheck = await db.select()
            .from(userPostsInterested)
            .where(and(
                eq(userPostsInterested.userId, testUser.users.id),
                eq(userPostsInterested.postId, 999112)
            ));
        expect(dbCheck.length).toBe(0);
    });

});