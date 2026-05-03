import { eq, and } from 'drizzle-orm';
import { StatusCodes } from 'http-status-codes';
import { getInterestedUserPosts } from '../post.controller';
import { db } from '@/configs/database.config';
import { users, posts, userPostsInterested } from '@/models/schema';

describe('Unit Test: getInterestedUserPosts', () => {
    let mockRes: any;
    let next: any;

    // Lưu lại ID để xóa sau khi test
    const TEST_USER_ID = 9999;
    const TEST_POST_ID1 = 8888;
    const TEST_POST_ID2 = 7777;

    beforeEach(async () => {
        // 1. Dọn dẹp trước nếu lỡ lần test trước bị crash
        await db.delete(userPostsInterested).where(eq(userPostsInterested.userId, TEST_USER_ID));
        await db.delete(posts).where(eq(posts.id, TEST_POST_ID1));
        await db.delete(posts).where(eq(posts.id, TEST_POST_ID2));
        await db.delete(users).where(eq(users.id, TEST_USER_ID));

        // 2. Tạo dữ liệu thật trong DB
        await db.insert(users).values({
            id: TEST_USER_ID,
            fullName: 'QA Tester Manual Clean',
            email: 'qa_manual@gmail.com',
            password: 'password123'
        });

        await db.insert(posts).values({
            id: TEST_POST_ID1,
            title: 'Phòng trọ Test Manual',
            addressProvince: 'Hà Nội',
            addressDistrict: 'Cầu Giấy',
            addressWard: 'Dịch Vọng',
            type: 'rental',
            status: 'actived',
            ownerId:21
        });

        await db.insert(posts).values({
            id: TEST_POST_ID2,
            title: 'Phòng trọ Test Manual 2',
            addressProvince: 'Hà Nội',
            addressDistrict: 'Cầu Giấy',
            addressWard: 'Dịch Vọng',
            type: 'rental',
            status: 'actived',
            ownerId:21
        });

        await db.insert(userPostsInterested).values({
            userId: TEST_USER_ID,
            postId: TEST_POST_ID1
        });
        await db.insert(userPostsInterested).values({
            userId: TEST_USER_ID,
            postId: TEST_POST_ID2
        });
    });

    beforeEach(() => {
        mockRes = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis(),
        };
        next = jest.fn();
    });

    afterEach(async () => {
        // 3. Dọn dẹp sạch sẽ dấu vết
        await db.delete(userPostsInterested).where(eq(userPostsInterested.userId, TEST_USER_ID));
        await db.delete(posts).where(eq(posts.id, TEST_POST_ID1));
        await db.delete(posts).where(eq(posts.id, TEST_POST_ID2));
        await db.delete(users).where(eq(users.id, TEST_USER_ID));
    });

    test('TC_UNIT_QLBVDL_GETINTERESTED_1: Lấy danh sách bài quan tâm thành công', async () => {
        const req = {
            currentUser: { users: { id: TEST_USER_ID } },
            body: {
                whereConditions: { postId: TEST_POST_ID1 },
                orderConditions: {}
            }
        } as any;

        await getInterestedUserPosts(req, mockRes, next);

        const response = mockRes.json.mock.calls[0][0];
        expect(response.statusCode).toBe(StatusCodes.OK);

        // Kiểm tra xem dữ liệu trả về có đúng bài post vừa tạo không
        const found = response.data.some((item: any) => item.postId === TEST_POST_ID1);
        expect(found).toBe(true);
    }, 20000);

    test('TC_UNIT_QLBVDL_GETINTERESTED_2: Phủ nhánh khi không có id và postId trong whereConditions', async () => {
        const req = {
            currentUser: { users: { id: TEST_USER_ID } },
            body: {
                whereConditions: {}, // Trống id và postId
                orderConditions: {}
            }
        } as any;

        await getInterestedUserPosts(req, mockRes, next);

        const response = mockRes.json.mock.calls[0][0];
        // Kiểm tra xem res.json có được gọi với mã 200 không
        expect(response.statusCode).toBe(200);
        // Kiểm tra xem dữ liệu trả về có đúng bài post vừa tạo không
        expect(response.data.length).toBe(2); // Phải trả về cả 2 bài post quan tâm
        const found = response.data.some((item: any) => item.postId === TEST_POST_ID1);
        expect(found).toBe(true);
    }, 20000);


    test('TC_UNIT_QLBVDL_GETINTERESTED_3: Phủ nhánh chỉ sắp xếp theo updatedAt', async () => {
        const req = {
            currentUser: { users: { id: TEST_USER_ID } },
            body: {
                whereConditions: {},
                orderConditions: { updatedAt: 'desc' } // Chỉ updatedAt
            }
        } as any;

        await getInterestedUserPosts(req, mockRes, next);
        expect(mockRes.status).toHaveBeenCalledWith(200);

        const response = mockRes.json.mock.calls[0][0];
        expect(response.data.length).toBe(2);
        const update1 = response.data[0].updatedAt;
        const update2 = response.data[1].updatedAt;
        expect(new Date(update1).getTime()).toBeGreaterThanOrEqual(new Date(update2).getTime());

    }, 20000);

    test('TC_UNIT_QLBVDL_GETINTERESTED_4: Phủ nhánh sắp xếp theo cả hai điều kiện', async () => {
        const req = {
            currentUser: { users: { id: TEST_USER_ID } },
            body: {
                whereConditions: {},
                orderConditions: { updatedAt: 'asc', createdAt: 'desc' }
            }
        } as any;

        await getInterestedUserPosts(req, mockRes, next);
        expect(mockRes.status).toHaveBeenCalledWith(200);

        const response = mockRes.json.mock.calls[0][0];
        expect(response.data.length).toBe(2);
        const update1 = response.data[0].updatedAt;
        const update2 = response.data[1].updatedAt;
        expect(new Date(update1).getTime()).toBeLessThanOrEqual(new Date(update2).getTime());

        const create1 = response.data[0].createdAt;
        const create2 = response.data[1].createdAt;
        expect(new Date(create1).getTime()).toBeGreaterThanOrEqual(new Date(create2).getTime());

    }, 20000);

    test('TC_UNIT_QLBVDL_GETINTERESTED_5: Phủ nhánh catch khi req.body bị thiếu', async () => {
        const req = {
            currentUser: { users: { id: TEST_USER_ID } },
            // Thiếu body
        } as any;

        await getInterestedUserPosts(req, mockRes, next);

        // Kiểm tra xem hàm next đã được gọi với một Error chưa
        expect(next).toHaveBeenCalledWith(expect.any(Error));
    }, 20000);

    test('TC_UNIT_QLBVDL_GETINTERESTED_6: Phủ nhánh catch khi currentUser bị null', async () => {
        const req = {
            currentUser: null, // Gây lỗi tại dòng currentUser!
            body: { whereConditions: {}, orderConditions: {} }
        } as any;

        await getInterestedUserPosts(req, mockRes, next);

        expect(next).toHaveBeenCalledWith(expect.any(Error));
    }, 20000);

    test('TC_UNIT_QLBVDL_GETINTERESTED_7: Phủ nhánh khi lọc theo id của bản ghi quan tâm', async () => {
        const req = {
            currentUser: { users: { id: TEST_USER_ID } },
            body: {
                whereConditions: { id: TEST_POST_ID1 }, // Gửi id để kích hoạt nhánh mới
                orderConditions: {}
            }
        } as any;

        await getInterestedUserPosts(req, mockRes, next);

        const response = mockRes.json.mock.calls[0][0];

        // Kiểm tra statusCode trả về là 200 (Sử dụng .toBe thay vì toHaveBeenCalledWith)
        expect(response.statusCode).toBe(200);

        // Kiểm tra xem hàm status của Express có được gọi không
        expect(mockRes.status).toHaveBeenCalledWith(200);
    }, 20000);

    describe('Branch Coverage: postId Validation', () => {
        test('TC_UNIT_QLBVDL_GETINTERESTED_8: postId là null', async () => {
            const req = {
                currentUser: { users: { id: TEST_USER_ID } },
                body: { whereConditions: { postId: null }, orderConditions: {} }
            } as any;
            await getInterestedUserPosts(req, mockRes, next);
            // Nhánh (postId && ...) sẽ không chạy, where sẽ không có postId
            expect(mockRes.status).toHaveBeenCalledWith(200);
        }, 20000);

        test('TC_UNIT_QLBVDL_GETINTERESTED_9: postId là số âm', async () => {
            const req = {
                currentUser: { users: { id: TEST_USER_ID } },
                body: { whereConditions: { postId: -5 }, orderConditions: {} }
            } as any;
            await getInterestedUserPosts(req, mockRes, next);
            // Drizzle sẽ tìm postId = -5, kết quả trả về mảng rỗng []
            const response = mockRes.json.mock.calls[0][0];
            expect(response.data.length).toBe(0);
        });

        test('TC_UNIT_QLBVDL_GETINTERESTED_10: postId là chữ (NaN)', async () => {
            const req = {
                currentUser: { users: { id: TEST_USER_ID } },
                body: { whereConditions: { postId: 'abc' }, orderConditions: {} }
            } as any;
            await getInterestedUserPosts(req, mockRes, next);

            // KIỂM TRA: Thay vì check status 200, ta check xem next(error) có được gọi không
            expect(next).toHaveBeenCalled();
            const error = next.mock.calls[0][0];
            expect(error).toBeDefined();
        }, 20000);
    });


    describe('Branch Coverage: id Validation', () => {
        test('TC_UNIT_QLBVDL_GETINTERESTED_11: id là undefined/null', async () => {
            const req = {
                currentUser: { users: { id: TEST_USER_ID } },
                body: { whereConditions: { id: undefined }, orderConditions: {} }
            } as any;
            await getInterestedUserPosts(req, mockRes, next);
            expect(mockRes.status).toHaveBeenCalledWith(200);
        }, 20000);

        test('TC_UNIT_QLBVDL_GETINTERESTED_12: id là chuỗi tấn công hoặc chữ', async () => {
            const req = {
                currentUser: { users: { id: TEST_USER_ID } },
                body: { whereConditions: { id: 'some-string' }, orderConditions: {} }
            } as any;
            await getInterestedUserPosts(req, mockRes, next);
            // Kiểm tra xem code có crash không (nhờ khối catch)
            expect(next).not.toHaveBeenCalledWith(expect.any(TypeError));
        }, 20000);
    });

    describe('Branch Coverage: userId Isolation', () => {
        test('TC_UNIT_QLBVDL_GETINTERESTED_13: users.id là chuỗi không phải số', async () => {
            const req = {
                currentUser: { users: { id: 'not-a-number' } },
                body: { whereConditions: {}, orderConditions: {} }
            } as any;
            await getInterestedUserPosts(req, mockRes, next);


            // KIỂM TRA: 
            expect(next).toHaveBeenCalled();
            // Đảm bảo không truy cập mockRes.json nếu next đã được gọi
            if (next.mock.calls.length === 0) {
                const response = mockRes.json.mock.calls[0][0];
                expect(response.data.length).toBe(0);
            }
        }, 20000);

        test('TC_UNIT_QLBVDL_GETINTERESTED_14: users.id bị thiếu (Gây lỗi logic)', async () => {
            const req = {
                currentUser: { users: {} }, // Thiếu property id
                body: { whereConditions: {}, orderConditions: {} }
            } as any;
            await getInterestedUserPosts(req, mockRes, next);
            // Nhánh (users.id && ...) sẽ không được thỏa mãn
            expect(mockRes.status).toHaveBeenCalledWith(200);
        }, 20000);
    });


    test('TC_UNIT_QLBVDL_GETINTERESTED_15: Lọc theo id không có trong DB', async () => {
        const req = {
            currentUser: { users: { id: TEST_USER_ID } }, // User hợp lệ
            body: {
                whereConditions: { id: 9999999 }, // ID bản ghi không tồn tại
                orderConditions: {}
            }
        } as any;

        await getInterestedUserPosts(req, mockRes, next);

        // KẾT QUẢ MONG ĐỢI:
        // 1. Status vẫn là 200 OK (Vì truy vấn SQL hợp lệ nhưng không có kết quả)
        const response = mockRes.json.mock.calls[0][0];
        expect(response.statusCode).toBe(200);

        // 2. Dữ liệu trả về phải là mảng rỗng
        expect(Array.isArray(response.data)).toBe(true);
        expect(response.data.length).toBe(0);
    }, 20000);

    test('TC_UNIT_QLBVDL_GETINTERESTED_16: User ID không có trong DB (Hoặc chưa quan tâm bài nào)', async () => {
        const req = {
            currentUser: { users: { id: 8888888 } }, // User ID lạ
            body: {
                whereConditions: {},
                orderConditions: {}
            }
        } as any;

        await getInterestedUserPosts(req, mockRes, next);

        const response = mockRes.json.mock.calls[0][0];
        expect(response.statusCode).toBe(200);

        // Trả về mảng rỗng vì User này chưa nhấn "quan tâm" bài đăng nào
        expect(response.data.length).toBe(0);
    }, 20000);

    test('TC_UNIT_QLBVDL_GETINTERESTED_17: Lấy danh sách bài quan tâm không thành công do bài viết đã update thành hidden', async () => {
        
        await db.update(posts).set({ status: 'hidden' }).where(eq(posts.id, TEST_POST_ID1));

        const req = {
            currentUser: { users: { id: TEST_USER_ID } },
            body: {
                whereConditions: { postId: TEST_POST_ID1 },
                orderConditions: {}
            }
        } as any;

        await getInterestedUserPosts(req, mockRes, next);

        const response = mockRes.json.mock.calls[0][0];
        expect(response.statusCode).toBe(StatusCodes.OK);

        // Kiểm tra xem dữ liệu trả về có đúng bài post vừa tạo không
        const found = response.data.some((item: any) => item.postId === TEST_POST_ID1);
        expect(found).toBe(false); // Vì bài viết đã bị ẩn, nên không được trả về trong danh sách quan tâm nữa
    }, 10000);

});

