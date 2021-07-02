// @flow
import {
    mat4, quat,
    vec3,
    vec4
} from 'gl-matrix';

import MercatorCoordinate from '../geo/mercator_coordinate.js';

function getColumn(matrix: mat4, col: number): vec4 {
    return [matrix[col * 4], matrix[col * 4 + 1], matrix[col * 4 + 2], matrix[col * 4 + 3]];
}

function setColumn(matrix: mat4, col: number, values: vec4) {
    matrix[col * 4 + 0] = values[0];
    matrix[col * 4 + 1] = values[1];
    matrix[col * 4 + 2] = values[2];
    matrix[col * 4 + 3] = values[3];
}

function updateTransformOrientation(matrix: mat4, orientation: quat) {
    // Take temporary copy of position to prevent it from being overwritten
    const position: vec4 = getColumn(matrix, 3);

    // Convert quaternion to rotation matrix
    mat4.fromQuat(matrix, orientation);
    setColumn(matrix, 3, position);
}

function updateTransformPosition(matrix: mat4, position: vec3) {
    setColumn(matrix, 3, [position[0], position[1], position[2], 1.0]);
}

function orientationFromPitchBearing(pitch: number, bearing: number): quat {
    // Both angles are considered to define CW rotation around their respective axes.
    // Values have to be negated to achieve the proper quaternion in left handed coordinate space
    const orientation = quat.identity([]);
    quat.rotateZ(orientation, orientation, -bearing);
    quat.rotateX(orientation, orientation, -pitch);
    return orientation;
}

export class Camera {
    constructor (position: ?vec3, orientation: ?quat) {
        this._transform = mat4.identity([]);
        this._orientation = quat.identity([]);

        if (orientation) {
            this._orientation = orientation;
            updateTransformOrientation(this._transform, this._orientation);
        }

        if (position) {
            updateTransformPosition(this._transform, position);
        }
    }

    get mercatorPosition(): MercatorCoordinate {
        const pos = this.position;
        return new MercatorCoordinate(pos[0], pos[1], pos[2]);
    }

    get position(): vec3 {
        const col: vec4 = getColumn(this._transform, 3);
        return [col[0], col[1], col[2]];
    }

    set position(value: vec3) {
        updateTransformPosition(this._transform, value);
    }

    get orientation(): quat {
        return this._orientation;
    }

    set orientation(value: quat) {
        this._orientation = value;
        updateTransformOrientation(this._transform, this._orientation);
    }

    getPitchBearing(): {pitch: number, bearing: number} {
        const f = this.forward();
        const r = this.right();

        return {
            bearing: Math.atan2(-r[1], r[0]),
            pitch: Math.atan2(Math.sqrt(f[0] * f[0] + f[1] * f[1]), -f[2])
        };
    }

    setPitchBearing(pitch: number, bearing: number) {
        this._orientation = orientationFromPitchBearing(pitch, bearing);
        updateTransformOrientation(this._transform, this._orientation);
    }

    forward(): vec3 {
        const col: vec4 = getColumn(this._transform, 2);
        // Forward direction is towards the negative Z-axis
        return [-col[0], -col[1], -col[2]];
    }

    up(): vec3 {
        const col: vec4 = getColumn(this._transform, 1);
        // Up direction has to be flipped to point towards north
        return [-col[0], -col[1], -col[2]];
    }

    right(): vec3 {
        const col: vec4 = getColumn(this._transform, 0);
        return [col[0], col[1], col[2]];
    }

    getWorldToCamera(worldSize: number, pixelsPerMeter: number): Float64Array {
        // transformation chain from world space to camera space:
        // 1. Height value (z) of renderables is in meters. Scale z coordinate by pixelsPerMeter
        // 2. Transform from pixel coordinates to camera space with cameraMatrix^-1
        // 3. flip Y if required

        // worldToCamera: flip * cam^-1 * zScale
        // cameraToWorld: (flip * cam^-1 * zScale)^-1 => (zScale^-1 * cam * flip^-1)
        const matrix = new Float64Array(16);

        // Compute inverse of camera matrix and post-multiply negated translation
        const invOrientation = new Float64Array(4);
        const invPosition = this.position;

        quat.conjugate(invOrientation, this._orientation);
        vec3.scale(invPosition, invPosition, -worldSize);

        mat4.fromQuat(matrix, invOrientation);
        mat4.translate(matrix, matrix, invPosition);

        // Pre-multiply y (2nd row)
        matrix[1] *= -1.0;
        matrix[5] *= -1.0;
        matrix[9] *= -1.0;
        matrix[13] *= -1.0;

        // Post-multiply z (3rd column)
        matrix[8] *= pixelsPerMeter;
        matrix[9] *= pixelsPerMeter;
        matrix[10] *= pixelsPerMeter;
        matrix[11] *= pixelsPerMeter;

        return matrix;
    }

    getCameraToClipPerspective(fovy: number, aspectRatio: number, nearZ: number, farZ: number): Float64Array {
        const matrix = new Float64Array(16);
        mat4.perspective(matrix, fovy, aspectRatio, nearZ, farZ);
        return matrix;
    }
}
