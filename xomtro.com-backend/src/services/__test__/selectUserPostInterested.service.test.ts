import { db } from '@/configs/database.config';
import { userPostsInterested, users, posts } from '@/models/schema';
import { selectInterestedUserPostByConditions } from '../post.service';
import { eq, inArray } from 'drizzle-orm';

describe('Unit Test: selectInterestedUserPostByConditions', () => {
    const USER_ID = 101;
    const POST_IDS = [201, 202, 203];

    const cleanUp = async () => {
        await db.delete(userPostsInterested).where(eq(userPostsInterested.userId, USER_ID));
        await db.delete(posts).where(inArray(posts.id, POST_IDS));
        await db.delete(users).where(eq(users.id, USER_ID));
    };

    beforeAll(async () => await cleanUp());
    afterEach(async () => await cleanUp());

    async function seedData() {
        await db.insert(users).values({ id: USER_ID, email: 'sort@test.com', name: 'Sorter', password: '123' });
        await db.insert(posts).values(POST_IDS.map(id => ({
            id, ownerId: 21, title: `Post ${id}`, type: 'rental', status: 'actived',
            addressProvince: 'Hà Nội',
            addressDistrict: 'Cầu Giấy',
            addressWard: 'Dịch Vọng'
        })));

        // Chèn dữ liệu quan tâm với thời gian khác nhau (nếu bảng có createdAt)
        // Ở đây giả sử chèn theo thứ tự ID để test sort
        await db.insert(userPostsInterested).values([
            { userId: USER_ID, postId: POST_IDS[0] }, // 201
            { userId: USER_ID, postId: POST_IDS[2] }, // 203
            { userId: USER_ID, postId: POST_IDS[1] }, // 202
        ]);
    }

    // --- TEST CASES ---

    test('TC_UNIT_QLBVDL_SELECTINTEREST_1: Lọc bài viết quan tâm theo UserId', async () => {
        await seedData();

        const conditions = {
            userId: { value: USER_ID, operator: 'eq' }
        };

        const result = await selectInterestedUserPostByConditions(conditions as any);

        expect(result.length).toBe(3);
        expect(result[0].userId).toBe(USER_ID);
    });

    test('TC_UNIT_QLBVDL_SELECTINTEREST_2: Sắp xếp kết quả theo PostId giảm dần (DESC)', async () => {
        await seedData();

        const conditions = { userId: { value: USER_ID, operator: 'eq' } };
        const options = {
            orderConditions: {
                postId: 'desc'
            }
        };

        const result = await selectInterestedUserPostByConditions(conditions as any, options as any);

        expect(result.length).toBe(3);
        // Kiểm tra thứ tự: 203 -> 202 -> 201
        expect(result[0].postId).toBe(203);
        expect(result[1].postId).toBe(202);
        expect(result[2].postId).toBe(201);
    });

    test('TC_UNIT_QLBVDL_SELECTINTEREST_3: Kết hợp Lọc (IN) và Sắp xếp (ASC)', async () => {
        await seedData();

        const conditions = {
            userId: { value: USER_ID, operator: 'eq' },
            postId: { value: [201, 203], operator: 'in' }
        };
        const options = {
            orderConditions: { postId: 'asc' }
        };

        const result = await selectInterestedUserPostByConditions(conditions as any, options as any);

        expect(result.length).toBe(2);
        expect(result[0].postId).toBe(201);
        expect(result[1].postId).toBe(203);
    });

    test('TC_UNIT_QLBVDL_SELECTINTEREST_4: Trả về toàn bộ danh sách khi không có conditions và options', async () => {
        await seedData();

        // Gọi hàm không tham số
        const result = await selectInterestedUserPostByConditions();

        expect(result.length).toBeGreaterThanOrEqual(3);
    });

    test('TC_UNIT_QLBVDL_SELECTINTEREST_5: Xử lý an toàn khi orderConditions chứa trường không tồn tại', async () => {
        await seedData();

        const options = {
            orderConditions: { unknownField: 'asc' }
        };

        // Mong đợi: Hàm vẫn chạy (không crash) và bỏ qua field lạ hoặc xử lý êm đẹp
        const result = await selectInterestedUserPostByConditions(undefined, options as any);
        expect(result).toBeDefined();
    });

    test('TC_UNIT_QLBVDL_SELECTINTEREST_6: Xử lý an toàn khi Conditions chứa trường không tồn tại', async () => {
        await seedData();

        // Giả sử 'ghostField' không có trong bảng userPostsInterested
        const conditions = {
            userId: { value: USER_ID, operator: 'eq' },
            ghostField: { value: 'hack_me', operator: 'eq' }
        };

        // Mong đợi: Hàm không văng lỗi (crash)
        const result = await selectInterestedUserPostByConditions(conditions as any);

        // Mong đợi: Kết quả trả về vẫn đúng dựa trên các trường hợp lệ (userId)
        // Trường 'ghostField' phải bị code của bạn lờ đi (filter ra khỏi whereClause)
        expect(result).toBeDefined();
        expect(result.length).toBe(3);
        expect(result[0].userId).toBe(USER_ID);
    });

    test('TC_UNIT_QLBVDL_SELECTINTEREST_7: Trả về mảng rỗng khi user không tồn tại', async () => {
        await seedData();

        const conditions = {
            userId: { value: 999999, operator: 'eq' } // User không tồn tại
        };

        const result = await selectInterestedUserPostByConditions(conditions as any);

        expect(result).toBeDefined();
        expect(result.length).toBe(0);
    });

    test('TC_UNIT_QLBVDL_SELECTINTEREST_8: Trả về mảng rỗng khi user không có bài viết quan tâm nào', async () => {
        await seedData();

        const conditions = {
            userId: { value: 21, operator: 'eq' } // User tồn tại nhưng không có bài viết quan tâm
        };

        const result = await selectInterestedUserPostByConditions(conditions as any);

        expect(result).toBeDefined();
        expect(result.length).toBe(0);
    });


    test('TC_UNIT_QLBVDL_SELECTINTEREST_9: Kiểm tra xem danh sách bài viết có bài viết hidden không được trả về', async () => {
        await seedData();
        // Cập nhật một bài viết thành 'hidden'
        await db.update(posts).set({status: 'hidden'}).where(eq(posts.id, POST_IDS[0]));

        const conditions = {
            userId: { value: USER_ID, operator: 'eq' }
        };

        const result = await selectInterestedUserPostByConditions(conditions as any);

        // Kiểm tra rằng không có bài viết nào có status là 'hidden'
        result.forEach((post) => {
            expect(post.status).not.toBe('hidden');
        });
    });
});