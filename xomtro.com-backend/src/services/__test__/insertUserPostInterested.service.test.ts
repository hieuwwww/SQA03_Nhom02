import { db } from '@/configs/database.config';
import { users, posts, userPostsInterested } from '@/models/schema';
import { insertUserPostInterested } from '../post.service'; // Điều chỉnh đường dẫn
import { eq, and } from 'drizzle-orm';

describe('Unit Test: insertUserPostInterested', () => {
    const TEST_USER_ID = 999;
    const TEST_POST_ID = 888;
    const TEST_POST_ID2 = 889;

    // Dọn dẹp dữ liệu trước và sau mỗi test
    const cleanUp = async () => {
        await db.delete(userPostsInterested).where(
            and(
                eq(userPostsInterested.userId, TEST_USER_ID),
                eq(userPostsInterested.postId, TEST_POST_ID)
            )
        );
        await db.delete(userPostsInterested).where(
            and(
                eq(userPostsInterested.userId, TEST_USER_ID),
                eq(userPostsInterested.postId, TEST_POST_ID2)
            )
        );
        await db.delete(posts).where(eq(posts.id, TEST_POST_ID));
        await db.delete(posts).where(eq(posts.id, TEST_POST_ID2));
        await db.delete(users).where(eq(users.id, TEST_USER_ID));
    };

    beforeAll(async () => await cleanUp());
    afterEach(async () => await cleanUp());

    /**
     * Chuẩn bị dữ liệu mẫu (Cần có User và Post trước do ràng buộc Khóa ngoại)
     */
    async function seedDependencies() {
        await db.insert(users).values({ 
            id: TEST_USER_ID, email: 'test@example.com', 
            name: 'Tester', password: '123' 
        });
        await db.insert(posts).values({ 
            id: TEST_POST_ID, 
            ownerId: TEST_USER_ID, 
            title: 'Bài viết mục tiêu', 
            type: 'rental', 
            titleSlug: 'can-ho-test-day-du-tien-nghi',
            description: 'Mô tả chi tiết bài viết test',
            addressProvince: 'Hà Nội',
            addressDistrict: 'Cầu Giấy',
            addressWard: 'Dịch Vọng',
            addressDetail: 'Số 1 Duy Tân',
            addressSlug: 'dich-vong-cau-giay-ha-noi',
            addressLongitude: 102,
            addressLatitude: 21,
            expirationAfter: 30,
            expirationAfterUnit: 'day',
            status: 'actived' 
        });

        await db.insert(posts).values({ 
            id: TEST_POST_ID2, 
            ownerId: 21, 
            title: 'Bài viết mục tiêu', 
            type: 'rental', 
            titleSlug: 'can-ho-test-day-du-tien-nghi',
            description: 'Mô tả chi tiết bài viết test',
            addressProvince: 'Hà Nội',
            addressDistrict: 'Cầu Giấy',
            addressWard: 'Dịch Vọng',
            addressDetail: 'Số 1 Duy Tân',
            addressSlug: 'dich-vong-cau-giay-ha-noi',
            addressLongitude: 102,
            addressLatitude: 21,
            expirationAfter: 30,
            expirationAfterUnit: 'day',
            status: 'hidden' 
        });
    }

    // --- CÁC TEST CASES ---

    test('TC_UNIT_QLBVDL_INSERTINTEREST_1: Chèn thành công bản ghi quan tâm bài viết', async () => {
        await seedDependencies();

        const payload = {
            userId: TEST_USER_ID,
            postId: TEST_POST_ID
        };

        const result = await insertUserPostInterested(payload);

        // 1. Kiểm tra kết quả trả về (Drizzle $returningId trả về mảng các ID)
        expect(result).toBeDefined();
        
        // 2. Truy vấn trực tiếp DB để xác nhận dữ liệu đã tồn tại
        const savedRecord = await db
            .select()
            .from(userPostsInterested)
            .where(
                and(
                    eq(userPostsInterested.userId, TEST_USER_ID),
                    eq(userPostsInterested.postId, TEST_POST_ID)
                )
            );

        expect(savedRecord.length).toBe(1);
        expect(savedRecord[0].userId).toBe(TEST_USER_ID);
        expect(savedRecord[0].postId).toBe(TEST_POST_ID);
    });

    test('TC_UNIT_QLBVDL_INSERTINTEREST_2: Lỗi khi chèn trùng lặp (Duplicate Entry)', async () => {
        await seedDependencies();
        const payload = { userId: TEST_USER_ID, postId: TEST_POST_ID };

        // Chèn lần 1
        await insertUserPostInterested(payload);

        // Chèn lần 2 (Mong đợi ném ra lỗi từ MySQL do Primary Key hoặc Unique Key)
        await expect(insertUserPostInterested(payload))
            .rejects
            .toThrow(); 
    });

    test('TC_UNIT_QLBVDL_INSERTINTEREST_3: Lỗi khi chèn với ID không tồn tại (Foreign Key Constraint)', async () => {
        const payload = {
            userId: 999999, // User không tồn tại
            postId: 888888  // Post không tồn tại
        };

        // Mong đợi lỗi ràng buộc khóa ngoại
        await expect(insertUserPostInterested(payload))
            .rejects
            .toThrow();
    });


    test('TC_UNIT_QLBVDL_INSERTINTEREST_4: Chèn không thành công bản ghi quan tâm bài viết có status không là actived', async () => {
        await seedDependencies();

        const payload = {
            userId: TEST_USER_ID,
            postId: TEST_POST_ID2
        };

        // Mong đợi lỗi do post có status là 'hidden', không phải 'actived'
        await expect(insertUserPostInterested(payload))
            .rejects
            .toThrow();
    });
});