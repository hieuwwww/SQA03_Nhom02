import { db } from '@/configs/database.config';
import { users, posts, userPostsInterested } from '@/models/schema';
import { deleteUserPostInterestByConditions } from '../post.service'; // Điều chỉnh đường dẫn thực tế
import { eq, and, inArray } from 'drizzle-orm';

describe('Unit Test: deleteUserPostInterestByConditions', () => {
    const USER_ID = 555;
    const POST_ID_1 = 444;
    const POST_ID_2 = 445;

    // Hàm dọn dẹp dữ liệu để các test case không ảnh hưởng lẫn nhau
    const cleanUp = async () => {
        await db.delete(userPostsInterested).where(eq(userPostsInterested.userId, USER_ID));
        await db.delete(posts).where(inArray(posts.id, [POST_ID_1, POST_ID_2]));
        await db.delete(users).where(eq(users.id, USER_ID));
    };

    beforeAll(async () => await cleanUp());
    afterEach(async () => await cleanUp());

    /**
     * Seed dữ liệu mẫu: 1 User quan tâm 2 bài viết
     */
    async function seedInterests() {
        await db.insert(users).values({ id: USER_ID, email: 'del@test.com', name: 'Delete Tester', password: '123' });
        await db.insert(posts).values([
            {
                id: POST_ID_1, ownerId: USER_ID, title: 'Post 1', type: 'rental', status: 'actived',
                addressProvince: 'Hà Nội',
                addressDistrict: 'Cầu Giấy',
                addressWard: 'Dịch Vọng',
                addressDetail: 'Số 1 Duy Tân'
            },
            {
                id: POST_ID_2, ownerId: USER_ID, title: 'Post 2', type: 'rental', status: 'actived',
                addressProvince: 'Hà Nội',
                addressDistrict: 'Cầu Giấy',
                addressWard: 'Dịch Vọng',
                addressDetail: 'Số 2 Duy Tân'
            }
        ]);
        await db.insert(userPostsInterested).values([
            { userId: USER_ID, postId: POST_ID_1 },
            { userId: USER_ID, postId: POST_ID_2 }
        ]);
    }

    // --- CÁC TEST CASES ---

    test('TC_UNIT_QLBVDL_DELETEINTEREST_1: Xóa chính xác 1 bản ghi theo cặp UserId và PostId', async () => {
        await seedInterests();

        const conditions = {
            userId: { value: USER_ID, operator: 'eq' },
            postId: { value: POST_ID_1, operator: 'eq' }
        };

        await deleteUserPostInterestByConditions(conditions as any);

        // Kiểm tra: Chỉ Post 1 bị xóa, Post 2 vẫn phải còn
        const remaining = await db.select().from(userPostsInterested).where(eq(userPostsInterested.userId, USER_ID));
        expect(remaining.length).toBe(1);
        expect(remaining[0].postId).toBe(POST_ID_2);
    });

    test('TC_UNIT_QLBVDL_DELETEINTEREST_2: Xóa tất cả quan tâm của một Người dùng cụ thể', async () => {
        await seedInterests();

        const conditions = {
            userId: { value: USER_ID, operator: 'eq' }
        };

        await deleteUserPostInterestByConditions(conditions as any);

        // Kiểm tra: Mọi bản ghi của USER_ID phải trống
        const remaining = await db.select().from(userPostsInterested).where(eq(userPostsInterested.userId, USER_ID));
        expect(remaining.length).toBe(0);
    });

    test('TC_UNIT_QLBVDL_DELETEINTEREST_3: Không xóa gì nếu điều kiện lọc không khớp dữ liệu', async () => {
        await seedInterests();

        const conditions = {
            userId: { value: 999999, operator: 'eq' } // ID không tồn tại
        };

        await deleteUserPostInterestByConditions(conditions as any);

        // Kiểm tra: Dữ liệu ban đầu vẫn được giữ nguyên
        const remaining = await db.select().from(userPostsInterested).where(eq(userPostsInterested.userId, USER_ID));
        expect(remaining.length).toBe(2);
    });

    test('TC_UNIT_QLBVDL_DELETEINTEREST_4: Xóa hàng loạt bài viết bằng toán tử IN', async () => {
        await seedInterests();

        const conditions = {
            postId: { value: [POST_ID_1, POST_ID_2], operator: 'in' }
        };

        await deleteUserPostInterestByConditions(conditions as any);

        const remaining = await db.select().from(userPostsInterested).where(eq(userPostsInterested.userId, USER_ID));
        expect(remaining.length).toBe(0);
    });

    test('TC_UNIT_QLBVDL_DELETEINTEREST_5: Kiểm tra tính an toàn khi truyền điều kiện lọc rỗng', async () => {
        await seedInterests();

        // Trong SQA, nếu truyền {} mà code không chặn, nó có thể xóa sạch bảng.
        // Test này xác nhận hành vi hiện tại của code.
        const conditions = {};

        await deleteUserPostInterestByConditions(conditions as any);

        // Nếu code của bạn dùng and(...whereClause) với mảng rỗng, 
        // hãy kiểm tra xem nó có xóa nhầm data không.
        const remaining = await db.select().from(userPostsInterested).where(eq(userPostsInterested.userId, USER_ID));
        // Mong đợi: Code nên an toàn, không xóa gì nếu không có điều kiện.
        expect(remaining.length).toBeGreaterThan(0);
    });

    test('TC_UNIT_QLBVDL_DELETEINTEREST_6: Kiểm tra tính lặp lại - Xóa lại một bản ghi đã bị xóa trước đó', async () => {
        await seedInterests(); // Seed để có bản ghi ban đầu (Post 1 và Post 2)

        const conditions = {
            userId: { value: USER_ID, operator: 'eq' },
            postId: { value: POST_ID_1, operator: 'eq' }
        };

        // 1. Thực hiện xóa lần thứ nhất
        await deleteUserPostInterestByConditions(conditions as any);

        // Kiểm tra nhanh để chắc chắn lần 1 đã xóa thành công
        const check1 = await db.select().from(userPostsInterested).where(
            and(eq(userPostsInterested.userId, USER_ID), eq(userPostsInterested.postId, POST_ID_1))
        );
        expect(check1.length).toBe(0);

        // 2. Thực hiện xóa lần thứ hai (Xóa lại chính ID đó)
        // Mong đợi: Hàm không ném ra lỗi (Exception), MySQL trả về "Affected rows: 0" và code vẫn chạy tiếp
        await expect(deleteUserPostInterestByConditions(conditions as any))
            .resolves // Đảm bảo Promise vẫn hoàn thành thành công
            .not.toThrow();

        // 3. Kiểm tra cuối cùng: Bản ghi vẫn không tồn tại và không gây tác động phụ đến bản ghi khác
        const check2 = await db.select().from(userPostsInterested).where(eq(userPostsInterested.userId, USER_ID));
        expect(check2.length).toBe(1); // Chỉ còn lại Post 2
        expect(check2[0].postId).toBe(POST_ID_2);
    });
});